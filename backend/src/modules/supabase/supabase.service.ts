import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subgraph } from './subgraph.entity';

@Injectable()
export class SupabaseService implements OnModuleInit {
  constructor(
    @InjectRepository(Subgraph)
    private subgraphRepository: Repository<Subgraph>
  ) {}

  async onModuleInit() {
    console.log('SupabaseService onModuleInit');
    const subgraphs = await this.subgraphRepository.find();
    console.log(`Found ${subgraphs.length} subgraphs in database`);
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

} 