import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Subgraph])
  ],
  providers: [SupabaseService, EmbeddingsService],
  exports: [SupabaseService]
})
export class SupabaseModule {} 