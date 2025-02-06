import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class SupabaseService implements OnModuleInit {
  constructor(
    @InjectRepository(Subgraph)
    private subgraphRepository: Repository<Subgraph>,
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


} 