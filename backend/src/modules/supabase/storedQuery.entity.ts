import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('stored_queries')
export class StoredQuery {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('text', { nullable: true })
    path: string;

    @Column('jsonb', { nullable: true })
    subgraph_queries: any[];

    @Column('jsonb', { nullable: true })
    requirements: any[];

    @Column('timestamp', { nullable: true })
    created_at: Date;

    @Column('timestamp', { nullable: true })
    updated_at: Date;
    
} 