import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subgraph } from './subgraph.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subgraph])
  ],
  providers: [SupabaseService],
  exports: [SupabaseService]
})
export class SupabaseModule {} 