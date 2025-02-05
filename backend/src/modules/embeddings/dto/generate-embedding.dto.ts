import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateEmbeddingDto {
  @ApiProperty({
    description: 'The text to generate embeddings for',
    example: 'This is a sample text for generating embeddings.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  input: string;
} 