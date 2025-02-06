import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { StoredQuery } from './storedQuery.entity';


@Injectable()
export class SupabaseService implements OnModuleInit {
  constructor(
    @InjectRepository(Subgraph)
    private subgraphRepository: Repository<Subgraph>,
    @InjectRepository(StoredQuery)
    private storedQueryRepository: Repository<StoredQuery>,
    private embeddingsService: EmbeddingsService,
    private configService: ConfigService
  ) { }

  async onModuleInit() {
    console.log('SupabaseService onModuleInit');
  }

  async getSubgraphs() {
    return await this.subgraphRepository.find();
  }

  async getSubgraphById(id: string) {
    return await this.subgraphRepository.findOne({ where: { id } });
  }

  async createSubgraph(data: Partial<Subgraph>) {
    const subgraph = this.subgraphRepository.create(data);
    return await this.subgraphRepository.save(subgraph);
  }

  async updateSubgraph(id: string, data: Partial<Subgraph>) {
    await this.subgraphRepository.update(id, data);
    return await this.getSubgraphById(id);
  }

  async deleteSubgraph(id: string) {
    return await this.subgraphRepository.delete(id);
  }

  async subgraphLoader() {
    try {
      const csv = fs.readFileSync('subgraphs.csv', 'utf8');
      const rows = csv.split('\n');
      for (const row of rows) {
        if (!row.trim()) continue;

        const [url, name, queries, signal, id] = row.split(',');
        try {
          const { embedding } = await this.embeddingsService.generateEmbedding(name) as any;
          await this.createSubgraph({
            id,
            name,
            url,
            queries_per_day: parseInt(queries.replace('K', '000').replace('.', '')),
            stake_amount: parseInt(signal.replace('K', '000').replace('.', '')),
            embedding: embedding.values
          });
        } catch (error) {
          console.error(`Error processing subgraph ${name}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in subgraphLoader:', error);
    }
  }


  async getSubgraphBySimilarity(name: string) {

    const { embedding } = await this.embeddingsService.generateEmbedding(name) as any;

    const query = `
        WITH vector_matches AS (
        SELECT id, 
               1 - (embedding <=> $1) as semantic_similarity
        FROM subgraphs
        WHERE 1 - (embedding <=> $1) > 0.8
        LIMIT 100
    ),
    keyword_matches AS (
    SELECT id,
           CASE 
               WHEN name ILIKE '%' || $2 || '%' THEN 0.8
               ELSE 0 
           END as name_similarity
    FROM subgraphs
    )
    SELECT s.id,
           s.name,
           s.url,
           s.queries_per_day,
           s.stake_amount,
           s.schema,
           vm.semantic_similarity * 0.7 +
           COALESCE(km.name_similarity, 0) * 0.3 as final_score
    FROM subgraphs s
    JOIN vector_matches vm ON s.id = vm.id
    LEFT JOIN keyword_matches km ON s.id = km.id
    ORDER BY final_score DESC
    LIMIT 4;
    `;

    const result = await this.subgraphRepository.query(query, [`[${embedding.values.join(',')}]`, name]);

    const subgraphs = []

    for (const subgraph of result) {
      let subgraphWithSchema = subgraph;
      if (!subgraph.schema) {
        console.log(`Retrieving schema for ${subgraph.id}`);
        const schema = await this.retrieveSchema(subgraph.id);
        console.log(`Updating schema for ${subgraph.id}`);
        await this.updateSubgraph(subgraph.id, { schema });
        subgraphWithSchema = await this.getSubgraphById(subgraph.id);
        subgraphWithSchema.embedding = undefined;
      }
      subgraphs.push(subgraphWithSchema);
    }

    return subgraphs;
  }

  async retrieveSchema(id: string) {

    const query = `
          query {
            __schema {
              types {
                name
                kind
                fields {
                  name
                  type {
                    name
                    kind
                    ofType {
                      name
                      kind
                    }
                  }
                }
              }
            }
          }
    `;

    const url = `https://gateway.thegraph.com/api/${this.configService.get('THEGRAPH_API_KEY')}/subgraphs/id/${id}`;
    const result = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ query }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await result.json() as { data: { __schema: any } };

    return data.data.__schema;
  }

  async storeQuery(path: string, subgraph_queries: any[], requirements: any[]) {

    console.log({ path, subgraph_queries, requirements });
    const query = this.storedQueryRepository.create({ path, subgraph_queries, requirements });
    return await this.storedQueryRepository.save(query);
  }


  async executeQuery(path: string) {
    const query = await this.storedQueryRepository.findOne({ where: { path } });
    if (!query) {
      throw new Error('Query not found');
    }
    const results = await Promise.all(
      query.subgraph_queries.map(async (sq: any) => {
        try {
          const response = await fetch(
            `https://gateway.thegraph.com/api/${this.configService.get('THEGRAPH_API_KEY')}/subgraphs/id/${sq.subgraphId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: sq.query })
            }
          );

          const data = await response.json();

          console.log({ data });

          const transformedData = await this.transformSubgraphData(data, sq.mappings);

          console.log({ transformedData });

          return {
            subgraphId: sq.subgraphId,
            data: transformedData
          };

        } catch (error) {
          console.error(`Error fetching from subgraph ${sq.subgraphId}:`, error);
          return {
            subgraphId: sq.subgraphId,
            error: 'Failed to fetch data'
          };
        }
      })
    );

    const mergedData = this.mergeSubgraphData(results, query.requirements);

    return mergedData;


  }

  async transformSubgraphData(data: any, mappings: any[]) {
    const result = [];

    const firstKey = Object.keys(data.data)[0];
    const items = data.data[firstKey];

    for (const item of items) {
      const transformed: any = {};

      for (const mapping of mappings) {
        let value = item;

        const fieldParts = mapping.field.split('.');
        for (const part of fieldParts) {
          value = value?.[part];
        }

        if (mapping.transformation) {
          value = await this.applyTransformation(value, mapping.transformation);
        }

        transformed[mapping.alias] = value;
      }

      result.push(transformed);
    }

    return result;
  }

  async mergeSubgraphData(results: any[], requirements: any) {
    const allData = results
      .filter(r => !r.error)
      .flatMap(r => r.data);

    if (requirements.specialRequirements.sortBy !== 'none') {
      allData.sort((a, b) => {
        const field = requirements.specialRequirements.sortBy;
        return b[field] - a[field]; 
      });
    }

    const filteredData = await this.applyFilters(allData, requirements.specialRequirements.additionalFilters);

    return filteredData;
  }

  async applyFilters(data: any[], filters: string[]) {
    return data.filter(item => {
      return filters.every(filter => {
        const [field, operation, value] = filter.split(':');
        const itemValue = item[field];

        switch (operation) {
          case 'min':
            return itemValue >= parseFloat(value);
          case 'max':
            return itemValue <= parseFloat(value);
          default:
            return true;
        }
      });
    });
  }


  async applyTransformation(value: any, transformation: string) {
    const transformations: Record<string, Function> = {
      'parseFloat': (v: string) => parseFloat(v),
      'parseInt': (v: string) => parseInt(v),
      'toString': (v: any) => String(v),
      'toFixed2': (v: number) => Number(parseFloat(String(v)).toFixed(2)),
      'multiply100': (v: number) => v * 100, 
    };

    if (transformation in transformations) {
      return transformations[transformation](value);
    }

    return value;
  }
} 