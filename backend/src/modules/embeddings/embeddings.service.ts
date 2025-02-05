import { Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;
  private isInitialized = false;

  constructor(
    private configService: ConfigService
  ) {}

  async onModuleInit() {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not configured');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({ model: "embedding-001" });
    this.isInitialized = true;
    console.log('EmbeddingsService initialized successfully');
  }

  async generateEmbedding(input: string): Promise<{ embedding: number[], text: string }> {
    if (!this.isInitialized) {
      throw new Error('EmbeddingsService not yet initialized');
    }

    try {
      const result = await this.embeddingModel.embedContent(input);
      const embedding = await result.embedding;

      return {
        embedding,
        text: input
      };
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
} 