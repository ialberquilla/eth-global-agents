import { Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;

  async onModuleInit() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
    this.embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
  }

  async generateEmbedding(input: string): Promise<{ embedding: number[], text: string }> {
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