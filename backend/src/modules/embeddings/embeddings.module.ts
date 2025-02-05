import { Module } from '@nestjs/common';
import { EmbeddingsController } from './embeddings.controller';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [],
  controllers: [EmbeddingsController],
  providers: [EmbeddingsService],
})
export class EmbeddingsModule {} 