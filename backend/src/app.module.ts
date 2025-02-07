import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmbeddingsModule } from './modules/embeddings/embeddings.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import constants from './constants';
import { Subgraph } from './modules/supabase/subgraph.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { StoredQuery } from './modules/supabase/storedQuery.entity';
import { Prompt } from './modules/supabase/prompt.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [constants],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'aws-0-eu-central-1.pooler.supabase.com',
      port: 6543,
      username: 'postgres.ohrqztdnojluxkxbnekj',
      password: process.env.DB_PASSWORD,
      database: 'postgres',
      entities: [Subgraph, StoredQuery, Prompt],
      synchronize: false,
      ssl: {
        rejectUnauthorized: false
      },
      extra: {
        family: 4,
        connectionTimeoutMillis: 5000
      }
    }),
    EmbeddingsModule,
    SupabaseModule,
  ],
})
export class AppModule {}