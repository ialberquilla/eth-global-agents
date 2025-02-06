import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subgraph } from './subgraph.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SubgraphsController } from './subgraph.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subgraph])
  ],
  providers: [SupabaseService, EmbeddingsService],
  exports: [SupabaseService],
  controllers: [SubgraphsController]
})
export class SupabaseModule {}  