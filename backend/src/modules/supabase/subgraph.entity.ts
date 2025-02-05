import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('subgraphs')
export class Subgraph {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { nullable: true })
  name: string;

  @Column('text', { nullable: true })
  protocol: string;

  @Column('text', { nullable: true })
  chain: string;

  @Column('integer', { nullable: true })
  queries_per_day: number;

  @Column('integer', { nullable: true })
  stake_amount: number;

  @Column('text', { nullable: true })
  url: string;

  @Column('jsonb', { nullable: true })
  embedding: number[];

  @Column('text', { nullable: true })
  schema: string;

  @Column('text', { array: true })
  entities: string[];
} 