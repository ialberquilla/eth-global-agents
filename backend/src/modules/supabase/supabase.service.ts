import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { StoredQuery } from './storedQuery.entity';
import { Prompt } from './prompt.entity';
interface SubgraphMapping {
  field: string;
  alias: string;
  transformation?: string;
}

interface ProcessedMapping extends SubgraphMapping {
  fieldParts: string[];
  transformFn: ((value: any) => any) | null;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  constructor(
    @InjectRepository(Subgraph)
    private subgraphRepository: Repository<Subgraph>,
    @InjectRepository(StoredQuery)
    private storedQueryRepository: Repository<StoredQuery>,
    @InjectRepository(Prompt)
    private promptRepository: Repository<Prompt>,
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

  // Cache transformations at class level for reuse
  private transformationFns: Record<string, (value: any) => any> = {
    'parseFloat': (v: string) => parseFloat(v),
    'parseInt': (v: string) => parseInt(v),
    'toString': (v: any) => String(v),
    'toFixed2': (v: number) => Number(parseFloat(String(v)).toFixed(2)),
    'multiply100': (v: number) => v * 100,
  };

  async executeQuery(id: string) {
    const startTime = Date.now();
    const TIMEOUT_MS = 10000; // 10 second timeout
    console.log(`[${new Date().toISOString()}] Starting query execution for id: ${id}`);

    const query = await this.storedQueryRepository.findOne({ where: { id } });
    if (!query) {
      throw new Error('Query not found');
    }
    console.log(`[${new Date().toISOString()}] Query fetched from DB in ${Date.now() - startTime}ms`);

    console.log(`[${new Date().toISOString()}] Preparing ${query.subgraph_queries.length} subgraph queries`);
    
    // Prepare all fetch requests first with timeout
    const fetchStartTime = Date.now();
    const fetchPromises = query.subgraph_queries.map(sq => ({
      subgraphId: sq.subgraphId,
      promise: Promise.race([
        fetch(
          `https://gateway.thegraph.com/api/${this.configService.get('THEGRAPH_API_KEY')}/subgraphs/id/${sq.subgraphId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sq.query })
          }
        ),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
        )
      ]),
      mappings: sq.mappings
    }));

    // Execute all fetches in parallel and process results
    const results = await Promise.all(
      fetchPromises.map(async ({ subgraphId, promise, mappings }) => {
        const subgraphStartTime = Date.now();
        try {
          console.log(`[${new Date().toISOString()}] Fetching data from subgraph ${subgraphId}`);
          const response = await promise as Response;
          const fetchEndTime = Date.now();
          console.log(`[${new Date().toISOString()}] Subgraph ${subgraphId} fetch completed in ${fetchEndTime - subgraphStartTime}ms`);

          const data = await response.json() as { data?: Record<string, any> };
          const jsonEndTime = Date.now();
          console.log(`[${new Date().toISOString()}] Subgraph ${subgraphId} JSON parsed in ${jsonEndTime - fetchEndTime}ms`);
          
          // Validate response structure
          if (!data?.data) {
            throw new Error('Invalid response structure');
          }

          // Pre-process mappings for faster transformation
          const processedMappings = mappings.map((m: SubgraphMapping): ProcessedMapping => ({
            ...m,
            fieldParts: m.field.split('.'),
            transformFn: m.transformation ? this.transformationFns[m.transformation] : null
          }));

          const transformStartTime = Date.now();
          const transformedData = this.transformSubgraphData(data, processedMappings);
          console.log(`[${new Date().toISOString()}] Subgraph ${subgraphId} data transformed in ${Date.now() - transformStartTime}ms`);
          
          return {
            subgraphId,
            data: transformedData,
            timing: {
              fetch: fetchEndTime - subgraphStartTime,
              parse: jsonEndTime - fetchEndTime,
              transform: Date.now() - transformStartTime,
              total: Date.now() - subgraphStartTime
            }
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[${new Date().toISOString()}] Error processing subgraph ${subgraphId}:`, errorMessage);
          return {
            subgraphId,
            error: errorMessage,
            timing: { error: true, total: Date.now() - subgraphStartTime }
          };
        }
      })
    );

    // Filter out failed queries and proceed with successful ones
    const successfulResults = results.filter(r => !r.error);
    console.log(`[${new Date().toISOString()}] ${successfulResults.length} of ${results.length} subgraph queries succeeded`);

    console.log(`[${new Date().toISOString()}] All subgraph fetches completed in ${Date.now() - fetchStartTime}ms`);
    console.log('Detailed timing per subgraph:', results.map(r => ({
      subgraphId: r.subgraphId,
      timing: r.timing
    })));

    const mergeStartTime = Date.now();
    const mergedData = await this.mergeSubgraphData(successfulResults, query.requirements);
    console.log(`[${new Date().toISOString()}] Data merged in ${Date.now() - mergeStartTime}ms`);

    console.log(`[${new Date().toISOString()}] Total execution time: ${Date.now() - startTime}ms`);
    return {
      data: mergedData,
      metadata: {
        total_subgraphs: results.length,
        successful_subgraphs: successfulResults.length,
        execution_time_ms: Date.now() - startTime,
        errors: results.filter(r => r.error).map(r => ({
          subgraphId: r.subgraphId,
          error: r.error
        }))
      }
    };
  }

  transformSubgraphData(data: any, processedMappings: ProcessedMapping[]) {
    const transformStart = Date.now();
    const firstKey = Object.keys(data.data)[0];
    if (!firstKey || !Array.isArray(data.data[firstKey])) {
      throw new Error('Invalid data structure or empty response');
    }
    
    const items = data.data[firstKey];
    const result = new Array(items.length);

    console.log(`Processing subgraph data with key: ${firstKey}, items: ${items.length}`);
    if (items.length > 0) {
      console.log('Sample raw item:', JSON.stringify(items[0], null, 2));
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const transformed: any = {};

      for (const mapping of processedMappings) {
        let value = item;
        
        for (const part of mapping.fieldParts) {
          value = value?.[part];
          if (value === undefined) break;
        }

        if (value !== undefined && mapping.transformFn) {
          value = mapping.transformFn(value);
        }

        transformed[mapping.alias] = value;
      }

      result[i] = transformed;
    }

    const totalTime = Date.now() - transformStart;
    if (items.length > 0) {
      console.log(`Transformed ${items.length} items in ${totalTime}ms (${totalTime/items.length}ms per item)`);
      console.log('Sample transformed item:', JSON.stringify(result[0], null, 2));
    }

    return result;
  }

  // Remove async since we're using cached functions
  applyTransformation(value: any, transformation: string) {
    return this.transformationFns[transformation]?.(value) ?? value;
  }

  async mergeSubgraphData(results: any[], requirements: any) {
    console.log('Starting data merge with results:', JSON.stringify(results.map(r => ({
      subgraphId: r.subgraphId,
      dataLength: r.data?.length || 0,
      sampleData: r.data?.[0]
    })), null, 2));

    // Pre-allocate array size and use direct assignment instead of flatMap
    const totalLength = results.reduce((sum, r) => !r.error && Array.isArray(r.data) ? sum + r.data.length : sum, 0);
    console.log(`Total items to merge: ${totalLength}`);
    
    const allData = new Array(totalLength);
    
    let index = 0;
    for (const result of results) {
      if (!result.error && Array.isArray(result.data)) {
        console.log(`Merging ${result.data.length} items from subgraph ${result.subgraphId}`);
        for (const item of result.data) {
          allData[index++] = item;
        }
      }
    }

    // Only sort if needed and use a more efficient sorting approach
    if (requirements?.specialRequirements?.sortBy !== 'none') {
      const sortField = requirements.specialRequirements.sortBy;
      console.log(`Sorting by field: ${sortField}`);
      allData.sort((a, b) => {
        const aVal = a?.[sortField] || 0;
        const bVal = b?.[sortField] || 0;
        return bVal - aVal;
      });
    }

    // Apply filters in a single pass if possible
    if (!requirements?.specialRequirements?.additionalFilters?.length) {
      console.log(`Returning ${allData.length} items without filtering`);
      return allData;
    }

    const filteredData = await this.applyFilters(allData, requirements.specialRequirements.additionalFilters);
    console.log(`Returning ${filteredData.length} items after filtering`);
    return filteredData;
  }

  async applyFilters(data: any[], filters: string[]) {
    // Pre-compile filter conditions for better performance
    const compiledFilters = filters.map(filter => {
      const [field, operation, value] = filter.split(':');
      const numValue = parseFloat(value);
      
      return {
        field,
        operation,
        value: numValue,
        test: (itemValue: number) => {
          switch (operation) {
            case 'min': return itemValue >= numValue;
            case 'max': return itemValue <= numValue;
            default: return true;
          }
        }
      };
    });

    // Single pass filtering with pre-compiled conditions
    return data.filter(item => 
      compiledFilters.every(filter => filter.test(item[filter.field] || 0))
    );
  }

  async storePrompt(prompt: string) {
    const promptEntity = this.promptRepository.create({ prompt });
    return await this.promptRepository.save(promptEntity);
  }
} 