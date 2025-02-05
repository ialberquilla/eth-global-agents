import { Body, Controller, Post, Query } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { GenerateEmbeddingDto } from './dto/generate-embedding.dto';

@Controller('embeddings')
export class EmbeddingsController {
  constructor(private readonly embeddingsService: EmbeddingsService) {}

  @Post('generate')
  async generateEmbedding(@Body() generateEmbeddingDto: GenerateEmbeddingDto) {
    const result = await this.embeddingsService.generateEmbedding(generateEmbeddingDto.input);
    return {
      success: true,
      data: result
    };
  }

} 