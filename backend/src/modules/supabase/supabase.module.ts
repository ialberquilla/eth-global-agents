import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SubgraphsController } from './subgraph.controller';
import { StoredQuery } from './storedQuery.entity';
import { Prompt } from './prompt.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subgraph, StoredQuery, Prompt])
  ],
  providers: [SupabaseService, EmbeddingsService],
  exports: [SupabaseService],
  controllers: [SubgraphsController]
})
export class SupabaseModule {}  