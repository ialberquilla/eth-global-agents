import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateEmbeddingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  input: string;
} 