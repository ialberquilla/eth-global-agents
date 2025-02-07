import express from 'express';
import cors from 'cors';
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import * as dotenv from "dotenv";
import { ActionProvider, WalletProvider, Network, CreateAction } from "@coinbase/agentkit";
import { generateAgentKitTemplate } from './templates/agentkit';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

const ValidationSchema = z.object({
    isValidRequest: z.boolean(),
    reason: z.string(),
    extractedInfo: z.object({
      protocols: z.array(z.string()),
      chains: z.array(z.string()),
      temporal: z.string().default("none"),
      metrics: z.array(z.string()),
      specialRequirements: z.object({
        needsComparison: z.boolean(),
        sortBy: z.string().default("none"),
        additionalFilters: z.array(z.string())
      })
    })
  });

  const QueryGeneratorSchema = z.object({
    queries: z.array(z.object({
      subgraphId: z.string(),
      query: z.string(),
      mappings: z.array(z.object({
        field: z.string(),
        alias: z.string(),
        transformation: z.string().optional()
      }))
    }))
  });


  const SubgraphSelectionSchema = z.object({
    selectedSubgraphs: z.array(z.object({
      protocol: z.string(),
      chain: z.string(),
      subgraphId: z.string(),
      reason: z.string(),
      confidence: z.number()
    }))
  });

const modifiers = {
    requestValidator: `
    You are a specialized agent for validating and enriching web3 data requests.
    Your job is to:
    1. Determine if the request is for blockchain/web3 data
    2. Extract and ENRICH key information like protocols, chains, and temporal requirements
    3. Infer missing but logical requirements based on the use case
    
    Follow these rules:
    - For yield/APY data, default temporal to "hourly" unless specified otherwise
    - If chains aren't specified, set to ["arbitrum", "base"]
    - For DeFi protocols, always include price and volume metrics
    - For yield queries, include APY, TVL, volume_24h as default metrics
    - If user mentions "best", add comparison/ranking requirements
    - For invalid requests, use "none" for temporal and sortBy fields (never use null)
    
    You must respond with a JSON object having this exact structure:
    {
      "isValidRequest": boolean,
      "reason": string,
      "extractedInfo": {
        "protocols": string[],
        "chains": string[],
        "temporal": string,  // use "none" for invalid requests
        "metrics": string[],
        "specialRequirements": {
          "needsComparison": boolean,
          "sortBy": string,  // use "none" for invalid requests
          "additionalFilters": string[]
        }
      }
    }
    
    Example for invalid request:
    {
      "isValidRequest": false,
      "reason": "This request is not related to web3 data",
      "extractedInfo": {
        "protocols": [],
        "chains": [],
        "temporal": "none",
        "metrics": [],
        "specialRequirements": {
          "needsComparison": false,
          "sortBy": "none",
          "additionalFilters": []
        }
      }
    }
    
    Example for yield query:
    {
      "isValidRequest": true,
      "reason": "Valid request for yield data across DeFi protocols",
      "extractedInfo": {
        "protocols": ["compound", "aave"],
        "chains": ["ethereum", "polygon", "arbitrum", "optimism", "base"],
        "temporal": "hourly",
        "metrics": ["apy", "tvl", "volume_24h", "total_supplied", "total_borrowed"],
        "specialRequirements": {
          "needsComparison": true,
          "sortBy": "apy",
          "additionalFilters": ["min_tvl:1000000"]
        }
      }
    }
    
    Ensure your response is valid JSON and follows this structure exactly.
  `,
  queryGenerator: `
    You are a specialized agent for generating optimized GraphQL queries for subgraphs.
    Your job is to:
    1. Analyze the provided subgraph schemas
    2. Generate clean, simple queries that fetch the required metrics
    3. Include field mappings for data unification
    
    Consider these rules when generating queries:
    - Keep queries simple and direct
    - Focus only on the fields needed for yield analysis
    - Add proper field aliases directly in the query
    - Include pagination (first: 1000)
    - Don't use fragments unless absolutely necessary

    You must respond with a JSON object having this exact structure:
    {
      "queries": [
        {
          "subgraphId": string,
          "query": string,
          "mappings": [
            {
              "field": string,
              "alias": string,
              "transformation": string (optional)
            }
          ]
        }
      ]
    }
    
    Example response:
    {
      "queries": [
        {
          "subgraphId": "aave_v3_arbitrum",
          "query": """
            query {
              reserves(first: 1000) {
                id
                symbol
                totalLiquidity
                totalBorrowsVariable
                liquidityRate
                price {
                  priceInUsd
                }
              }
            }
          """,
          "mappings": [
            {
              "field": "totalLiquidity",
              "alias": "total_supplied",
              "transformation": "parseFloat"
            },
            {
              "field": "liquidityRate",
              "alias": "apy",
              "transformation": "parseFloat"
            }
          ]
        }
      ]
    }
  `,
  subgraphSelector: `
  You are a specialized agent for selecting the most appropriate subgraphs for DeFi protocols.
  Your job is to:
  1. Analyze available subgraphs for each protocol/chain combination
  2. Select the best subgraph based on naming patterns and protocol conventions
  3. Provide reasoning for each selection
  
  Follow these naming conventions:
  - Official protocol subgraphs usually follow patterns like:
    * "{protocol}-v{version}-{chain}" (e.g., "aave-v3-arbitrum")
    * "{protocol}-{chain}" (e.g., "uniswap-arbitrum")
    * "{chain}/{protocol}" (e.g., "arbitrum/aave")
  - For AAVE: prefer "aave-v3" or "aave-v2" over forks
  - For Compound: prefer "compound-v3" or "compound-v2" over analytics
  - For Uniswap: prefer official deployments with highest query count
  
  You must respond with a JSON object having this exact structure:
  {
    "selectedSubgraphs": [
      {
        "protocol": string,
        "chain": string,
        "subgraphId": string,
        "reason": string,
        "confidence": number (0-1)
      }
    ]
  }

  Example response:
  {
    "selectedSubgraphs": [
      {
        "protocol": "aave",
        "chain": "arbitrum",
        "subgraphId": "aave-v3-arbitrum",
        "reason": "Official AAVE V3 deployment with highest query volume",
        "confidence": 0.95
      }
    ]
  }
`
};

interface SubgraphInfo {
  id: string;
  name: string;
  schema: string;
  url: string;
}

function parseAndValidateOutput(output: string, schema: z.ZodSchema) {
  try {
    let jsonStr = output;
    const codeBlockMatch = output.match(/```(?:json)?\n?(.*?)\n?```/s);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    jsonStr = jsonStr.trim();
    
    // Replace triple quotes with single quotes in GraphQL queries
    jsonStr = jsonStr.replace(/"""\s*([^]*?)\s*"""/g, function(match, query) {
      // Escape newlines and quotes in the query
      return '"' + query.trim().replace(/\n/g, '\\n').replace(/"/g, '\\"') + '"';
    });

    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (error) {
    console.error('Error parsing/validating output:', error);
    console.error('Raw output:', output);
    throw new Error('Failed to parse or validate LLM output');
  }
}


async function initialize() {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash-exp",
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const validatorAgent = createReactAgent({
    llm,
    tools: [],
    checkpointSaver: new MemorySaver(),
    messageModifier: modifiers.requestValidator,
  });

  const queryGeneratorAgent = createReactAgent({
    llm,
    tools: [],
    checkpointSaver: new MemorySaver(),
    messageModifier: modifiers.queryGenerator,
  });

  const subgraphSelectorAgent = createReactAgent({
    llm,
    tools: [],
    checkpointSaver: new MemorySaver(),
    messageModifier: modifiers.subgraphSelector,
  });

  return {
    validatorAgent,
    queryGeneratorAgent,
    subgraphSelectorAgent,
    config: { configurable: { thread_id: "Web3 Data Curator" } }
  };
}

let agents: any = null;
let agentConfig: any = null;

initialize().then(({ validatorAgent, queryGeneratorAgent, subgraphSelectorAgent, config }) => {
  agents = { validatorAgent, queryGeneratorAgent, subgraphSelectorAgent };
  agentConfig = config;
  console.log('Agents initialized successfully');
}).catch(error => {
  console.error('Failed to initialize agents:', error);
  process.exit(1);
});

// Helper function to send SSE message with retry logic
const sendSSEMessage = async (res: any, data: any) => {
  if (res.writableEnded) return;
  
  const maxRetries = 3;
  let retries = 0;
  
  const tryWrite = async () => {
    try {
      if (typeof data === 'string') {
        res.write(`data: ${data}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
      // Immediately flush the response
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (error) {
      console.error('Error writing SSE message:', error);
      if (retries < maxRetries) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await tryWrite();
      }
    }
  };
  
  await tryWrite();
};

// Keep-alive function to prevent timeout
const keepAlive = (res: any) => {
  const interval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(interval);
      return;
    }
    try {
      res.write(': keep-alive\n\n');
      // Immediately flush the response
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (error) {
      console.error('Error sending keep-alive:', error);
      clearInterval(interval);
    }
  }, 5000); // Send keep-alive every 5 seconds instead of 15
  
  return interval;
};

app.post('/chat', async (req, res) => {
  let keepAliveInterval: any;
  
  try {
    const { message } = req.body;
    console.log('Received message:', message);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!agents) {
      return res.status(503).json({ error: 'Agents not initialized' });
    }


    const prompt = await fetch(BACKEND_URL + '/api/subgraphs/prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: message })
    });

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Start keep-alive before any processing
    keepAliveInterval = keepAlive(res);

    try {
      console.log('Invoking validator agent...');
      const validationResult = await agents.validatorAgent.invoke(
        { messages: [new HumanMessage(message)] },
        agentConfig
      );

      console.log('Validation result received');
      
      const validatedData = parseAndValidateOutput(
        validationResult.messages[validationResult.messages.length - 1].content,
        ValidationSchema
      );
      
      console.log('Validation data parsed:', validatedData);

      if (validatedData.isValidRequest) {
        const { extractedInfo } = validatedData;
        console.log('Request is valid, sending validation response');

        const response = {
          type: 'validation',
          content: {
            summary: `I'll help you find ${extractedInfo.specialRequirements.needsComparison ? 'the best' : ''} data for ${extractedInfo.protocols.join(' and ')}`,
            details: [
              `📊 Tracking metrics: ${extractedInfo.metrics.join(', ')}`,
              `⏰ Update frequency: ${extractedInfo.temporal}`,
              `🔗 Chains covered: ${extractedInfo.chains.join(', ')}`,
              `📋 Additional requirements:`,
              ...extractedInfo.specialRequirements.additionalFilters.map((filter: string) => `  - ${filter}`),
              `🔄 Sorting by: ${extractedInfo.specialRequirements.sortBy}`
            ].join('\n')
          }
        };

        await sendSSEMessage(res, response);
        console.log('Validation response sent');

        // Add a small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));

        const allSubgraphsForSelection: any[] = [];

        for (const protocol of extractedInfo.protocols) {
          for (const chain of extractedInfo.chains) {
            console.log(`Fetching subgraphs for ${protocol} on ${chain}`);
            const subgraphs = await fetch(BACKEND_URL + '/api/subgraphs/similar?name=' + protocol + ' ' + chain).then(res => res.json()) as any[];
            console.log(`Found ${subgraphs.length} subgraphs for ${protocol} on ${chain}`);

            allSubgraphsForSelection.push({
              protocol,
              chain,
              availableSubgraphs: subgraphs.filter((s: any) => s.schema)
            });
          }
        }

        console.log('All subgraphs fetched:', allSubgraphsForSelection);

        const selectorInput = {
          requirements: extractedInfo,
          protocolsToSelect: allSubgraphsForSelection.map(item => ({
            protocol: item.protocol,
            chain: item.chain,
            subgraphs: item.availableSubgraphs.map((s: any) => ({
              id: s.id,
              name: s.name,
              queryVolume: s.queryVolume || 0,
              stakeAmount: s.stakeAmount || 0
            }))
          }))
        };

        console.log('Invoking subgraph selector agent');
        const selectionResult = await agents.subgraphSelectorAgent.invoke(
          { messages: [new HumanMessage(JSON.stringify(selectorInput))] },
          agentConfig
        );
        console.log('Subgraph selection result received');

        const selectedSubgraphs = parseAndValidateOutput(
          selectionResult.messages[selectionResult.messages.length - 1].content,
          SubgraphSelectionSchema
        );
        console.log('Selected subgraphs:', selectedSubgraphs);

        const selectionResponse = {
          type: 'subgraphs',
          content: {
            summary: `Selected best subgraphs for each protocol`,
            details: selectedSubgraphs.selectedSubgraphs.map((s: any) => 
              `- ${s.protocol} on ${s.chain}: ${s.subgraphId} (${Math.round(s.confidence * 100)}% confidence)\n`
            ).join('\n')
          }
        };

        await sendSSEMessage(res, selectionResponse);
        console.log('Selection response sent');

        // Add a small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('Generating queries for subgraphs...');
        const subgrapsToAnalize = selectedSubgraphs.selectedSubgraphs.map((selected: any) => {
          const protocolSubgraphs = allSubgraphsForSelection.find(
            (item: any) => item.protocol === selected.protocol && item.chain === selected.chain
          );
          return protocolSubgraphs?.availableSubgraphs.find(
            (s: any) => s.id === selected.subgraphId
          );
        }).filter(Boolean);

        const queryGenInput = {
          requirements: validatedData.extractedInfo,
          subgraphs: subgrapsToAnalize.map((s: any) => ({
            id: s.id,
            schema: s.schema,
            url: s.url
          }))
        };

        console.log('Invoking query generator agent');
        const queryGenResult = await agents.queryGeneratorAgent.invoke(
          { messages: [new HumanMessage(JSON.stringify(queryGenInput))] },
          agentConfig
        );
        console.log('Query generation result received');

        const parsedQueries = parseAndValidateOutput(
          queryGenResult.messages[queryGenResult.messages.length - 1].content,
          QueryGeneratorSchema
        );
        console.log('Queries parsed');

        const queriesResponse = {
          type: 'queries',
          content: {
            summary: `Generated ${parsedQueries.queries.length} optimized queries`,
            details: parsedQueries.queries.map((q: any) => ({
              subgraph: q.subgraphId,
              query: q.query.trim(),
              mappings: q.mappings
            }))
          }
        };

        await sendSSEMessage(res, queriesResponse);
        console.log('Queries response sent');

        // Add a small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('Storing queries...');
        const storeResponse = await fetch(BACKEND_URL + '/api/subgraphs/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: 'tbd',
            subgraph_queries: parsedQueries.queries,
            requirements: validatedData.extractedInfo
          })
        });

        const queryId = (await storeResponse.json() as { id: string }).id;
        console.log('Queries stored with ID:', queryId);

        const generatedQueryResponse = {
          type: 'generatedQuery',
          content: {
            summary: `To test it use the following command: curl -X GET ${BACKEND_URL}/api/subgraphs/execute?id=${queryId}`,
            details: {
              id: queryId,
            }
          }
        };

        await sendSSEMessage(res, generatedQueryResponse);
        console.log('Generated query response sent');

        // Add a small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));

        const actionProviderCode = generateAgentKitTemplate(BACKEND_URL, validatedData.extractedInfo);

        const codeGenerationResponse = {
          type: 'generatedCode',
          content: {
            summary: 'Generated Coinbase Agent Kit Action Provider',
            details: actionProviderCode
          }
        };

        await sendSSEMessage(res, codeGenerationResponse);
        console.log('Code generation response sent');

        // Add a small delay before ending
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        const errorResponse = {
          type: 'error',
          content: {
            summary: validatedData.reason,
            details: 'Please provide a request related to blockchain or web3 data analysis.'
          }
        };
        await sendSSEMessage(res, errorResponse);
      }

      await sendSSEMessage(res, '[DONE]');
      console.log('Stream complete');
      res.end();

    } catch (innerError) {
      console.error('Inner error:', innerError);
      if (!res.writableEnded) {
        await sendSSEMessage(res, {
          type: 'error',
          content: {
            summary: 'Sorry, I encountered an error processing your request.',
            details: innerError instanceof Error ? innerError.message : 'Please try again with your request.'
          }
        });
        await sendSSEMessage(res, '[DONE]');
        res.end();
      }
    }
  } catch (error) {
    console.error('Outer error:', error);
    if (!res.headersSent && !res.writableEnded) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      await sendSSEMessage(res, {
        type: 'error',
        content: {
          summary: 'An unexpected error occurred.',
          details: error instanceof Error ? error.message : 'Please try again with your request.'
        }
      });
      await sendSSEMessage(res, '[DONE]');
      res.end();
    }
  } finally {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});