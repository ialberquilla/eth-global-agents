// Helper function to generate action name and description
const generateActionMetadata = (requirements: {
  protocols: string[];
  metrics: string[];
  chains: string[];
  specialRequirements: {
    sortBy: string;
    additionalFilters: string[];
  };
}) => {
  const protocols = requirements.protocols.join(' and ');
  const metrics = requirements.metrics.join(', ');
  const chains = requirements.chains.join(', ');
  
  const name = `get_${protocols.toLowerCase().replace(/\s+/g, '_')}_${metrics.split(',')[0].toLowerCase().trim()}_data`;
  
  const description = `Fetch ${metrics} data for ${protocols} on ${chains} chains${
    requirements.specialRequirements.sortBy !== 'none' 
      ? ` sorted by ${requirements.specialRequirements.sortBy}` 
      : ''
  }${
    requirements.specialRequirements.additionalFilters.length > 0 
      ? ` with filters: ${requirements.specialRequirements.additionalFilters.join(', ')}` 
      : ''
  }`;

  return { name, description };
};

export const generateAgentKitTemplate = (apiUrl: string, requirements: {
  protocols: string[];
  metrics: string[];
  chains: string[];
  specialRequirements: {
    sortBy: string;
    additionalFilters: string[];
  };
}) => {
  const { name, description } = generateActionMetadata(requirements);
  
  return `
import { z } from "zod";
import { ActionProvider, WalletProvider, Network, CreateAction } from "@coinbase/agentkit";

// Schema for the query execution
export const ExecuteQuerySchema = z.object({
  queryId: z.string().describe("The ID of the stored query to execute"),
});

// Schema for the query response
export const QueryResponseSchema = z.object({
  data: z.array(z.object({
    ${requirements.metrics.map((metric: string) => `${metric}: z.number().optional()`).join(',\n    ')}
  })),
  metadata: z.object({
    total_subgraphs: z.number(),
    successful_subgraphs: z.number(),
    execution_time_ms: z.number(),
    errors: z.array(z.object({
      subgraphId: z.string(),
      error: z.string()
    }))
  })
});

class Web3DataActionProvider extends ActionProvider<WalletProvider> {
    private apiUrl: string;

    constructor(apiUrl: string = "${apiUrl}") {
        super("web3-data-provider", []);
        this.apiUrl = apiUrl;
    }

    @CreateAction({
        name: "${name}",
        description: "${description}",
        schema: ExecuteQuerySchema,
    })
    async executeAggregatedQuery(args: z.infer<typeof ExecuteQuerySchema>): Promise<string> {
        try {
            const response = await fetch(\`\${this.apiUrl}/api/subgraphs/execute?id=\${args.queryId}\`);
            const data = await response.json();
            
            // Validate response against schema
            const validatedData = QueryResponseSchema.parse(data);
            
            return JSON.stringify(validatedData, null, 2);
        } catch (error) {
            throw new Error(\`Failed to execute query: \${error.message}\`);
        }
    }

    supportsNetwork = (network: Network) => true;
}

export const web3DataActionProvider = (apiUrl?: string) => new Web3DataActionProvider(apiUrl);

// Usage example:
/*
const agentKit = new AgentKit({
    cdpApiKeyName: "YOUR_CDP_API_KEY_NAME",
    cdpApiKeyPrivate: "YOUR_CDP_API_KEY",
    actionProviders: [web3DataActionProvider()],
});
*/
`; 
}; 