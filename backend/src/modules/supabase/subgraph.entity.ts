import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('subgraphs')
export class Subgraph {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  protocol: string;

  @Column('text')
  chain: string;

  @Column('integer')
  queries_per_day: number;

  @Column('integer')
  stake_amount: number;

  @Column('text')
  url: string;

  @Column('jsonb', { nullable: true })
  embedding: number[];

  @Column('text')
  schema: string;

  @Column('text', { array: true })
  entities: string[];
} 