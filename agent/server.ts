import express from 'express';
import cors from 'cors';
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import * as dotenv from "dotenv";

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

  return {
    validatorAgent,
    queryGeneratorAgent,
    config: { configurable: { thread_id: "Web3 Data Curator" } }
  };
}

let agents: any = null;
let agentConfig: any = null;

initialize().then(({ validatorAgent, queryGeneratorAgent, config }) => {
  agents = { validatorAgent, queryGeneratorAgent };
  agentConfig = config;
  console.log('Agents initialized successfully');
}).catch(error => {
  console.error('Failed to initialize agents:', error);
  process.exit(1);
});

// Helper function to send SSE message
const sendSSEMessage = (res: any, data: any) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    console.log('Received message:', message);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!agents) {
      return res.status(503).json({ error: 'Agents not initialized' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      console.log('Invoking validator agent...');
      const validationResult = await agents.validatorAgent.invoke(
        { messages: [new HumanMessage(message)] },
        agentConfig
      );

      const validatedData = parseAndValidateOutput(
        validationResult.messages[validationResult.messages.length - 1].content,
        ValidationSchema
      );

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

        sendSSEMessage(res, response);

        const subgrapsToAnalize = []

        for (const protocol of extractedInfo.protocols) {
          for (const chain of extractedInfo.chains) {
            const subgraphs = await fetch(BACKEND_URL + '/api/subgraphs/similar?name=' + protocol + ' ' + chain).then(res => res.json()) as any[];

            subgrapsToAnalize.push(...subgraphs.filter((subgraph: any) => 
              subgraph.schema && 
              subgraph.name.toLowerCase().includes(protocol.toLowerCase()) && 
              subgraph.name.toLowerCase().includes(chain.toLowerCase())
            ));
          }
        }

        const subgraphsResponse = {
          type: 'subgraphs',
          content: {
            summary: `Found ${subgrapsToAnalize.length} subgraphs for your request`,
            details: subgrapsToAnalize.map((subgraph: any) => `- ${subgraph.name}`)
          }
        };

        sendSSEMessage(res, subgraphsResponse);

        console.log('Generating queries for subgraphs...');

        const queryGenInput = {
          requirements: validatedData.extractedInfo,
          subgraphs: subgrapsToAnalize.map(s => ({
            id: s.id,
            name: s.name,
            schema: s.schema,
            url: s.url
          }))
        };

        const queryGenResult = await agents.queryGeneratorAgent.invoke(
          { messages: [new HumanMessage(JSON.stringify(queryGenInput))] },
          agentConfig
        );

        const parsedQueries = parseAndValidateOutput(
          queryGenResult.messages[queryGenResult.messages.length - 1].content,
          QueryGeneratorSchema
        );

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

        sendSSEMessage(res, queriesResponse);

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

        console.log('Stored queries:', storeResponse);

      } else {
        const errorResponse = {
          type: 'error',
          content: {
            summary: validatedData.reason,
            details: 'Please provide a request related to blockchain or web3 data analysis.'
          }
        };
        sendSSEMessage(res, errorResponse);
      }

      sendSSEMessage(res, '[DONE]');
      res.end();

    } catch (innerError) {
      console.error('Inner error:', innerError);
      sendSSEMessage(res, {
        type: 'error',
        content: {
          summary: 'Sorry, I encountered an error processing your request.',
          details: 'Please try again with your request.'
        }
      });
      sendSSEMessage(res, '[DONE]');
      res.end();
    }

  } catch (error) {
    console.error('Outer error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      sendSSEMessage(res, {
        type: 'error',
        content: {
          summary: 'An unexpected error occurred.',
          details: 'Please try again with your request.'
        }
      });
      sendSSEMessage(res, '[DONE]');
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});