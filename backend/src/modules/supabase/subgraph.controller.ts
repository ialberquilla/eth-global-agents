import {
    Controller,
    Get,
    Query,
    Post,
    Body
} from '@nestjs/common';    
import { SupabaseService } from './supabase.service';

@Controller('subgraphs')
export class SubgraphsController {

    constructor(private readonly supabaseService: SupabaseService) { }

    @Get()
    getSubgraphs() {
        return this.supabaseService.getSubgraphs();
    }

    @Get('/similar')
    getSimilarSubgraphs(
        @Query('name') name: string
    ) {
        return this.supabaseService.getSubgraphBySimilarity(name);
    }

    @Get('/execute')
    executeQuery(
        @Query('path') path: string
    ) {
        return this.supabaseService.executeQuery(path);
    }

    @Post('/store')
    storeQuery(
        @Body('path') path: string,
        @Body('subgraph_queries') subgraph_queries: any,
        @Body('requirements') requirements: any
    ) {
        return this.supabaseService.storeQuery(path, subgraph_queries, requirements);
    }
}