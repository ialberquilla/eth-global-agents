import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('prompts')
export class Prompt {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { nullable: true })
  prompt: string;

} 