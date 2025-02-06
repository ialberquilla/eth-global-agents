
import {
    Controller,
    Get,
    Query
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
}