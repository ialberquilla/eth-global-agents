import express from 'express';
import cors from 'cors';
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ValidationSchema = z.object({
    isValidRequest: z.boolean(),
    reason: z.string(),
    extractedInfo: z.object({
      protocols: z.array(z.string()),
      chains: z.array(z.string()),
      temporal: z.string(),
      metrics: z.array(z.string()),
      specialRequirements: z.object({
        needsComparison: z.boolean(),
        sortBy: z.string(),
        additionalFilters: z.array(z.string())
      })
    })
  });

const SubgraphMatchSchema = z.object({
  recommendedSubgraphs: z.array(z.object({
    id: z.string(),
    url: z.string(),
    reason: z.string(),
    relevanceScore: z.number()
  })),
  suggestedFields: z.array(z.string()),
  queryOptimizations: z.array(z.string())
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
    
    You must respond with a JSON object having this exact structure:
    {
      "isValidRequest": boolean,
      "reason": string,
      "extractedInfo": {
        "protocols": string[],
        "chains": string[],
        "temporal": string,
        "metrics": string[],
        "specialRequirements": {
          "needsComparison": boolean,
          "sortBy": string,
          "additionalFilters": string[]
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
  
  subgraphMatcher: `
    You are a specialized agent for matching user requirements to subgraphs.
    You work with embeddings and semantic search results to:
    1. Analyze semantic search results
    2. Filter and rank matches based on requirements
    3. Optimize query suggestions
    
    You must respond with a JSON object having this exact structure:
    {
      "recommendedSubgraphs": [
        {
          "id": string,
          "url": string,
          "reason": string,
          "relevanceScore": number
        }
      ],
      "suggestedFields": string[],
      "queryOptimizations": string[]
    }
    
    Ensure your response is valid JSON and follows this structure exactly.
  `
};

function parseAndValidateOutput(output: string, schema: z.ZodSchema) {
  try {
    let jsonStr = output;
    const codeBlockMatch = output.match(/```(?:json)?\n?(.*?)\n?```/s);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    jsonStr = jsonStr.trim();
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (error) {
    console.error('Error parsing/validating output:', error);
    console.error('Raw output:', output);
    throw new Error('Failed to parse or validate LLM output');
  }
}

async function searchSubgraphs(requirements: any) {
  return [];
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

  const matcherAgent = createReactAgent({
    llm,
    tools: [
      new DynamicTool({
        name: 'searchSubgraphs',
        description: 'Search for relevant subgraphs using protocol name',
        func: searchSubgraphs,
      })
    ],
    checkpointSaver: new MemorySaver(),
    messageModifier: modifiers.subgraphMatcher,
  });

  return {
    validatorAgent,
    matcherAgent,
    config: { configurable: { thread_id: "Web3 Data Curator" } }
  };
}

let agents: any = null;
let agentConfig: any = null;

initialize().then(({ validatorAgent, matcherAgent, config }) => {
  agents = { validatorAgent, matcherAgent };
  agentConfig = config;
  console.log('Agents initialized successfully');
}).catch(error => {
  console.error('Failed to initialize agents:', error);
  process.exit(1);
});

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!agents) {
      return res.status(503).json({ error: 'Agents not initialized' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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

        res.write(`data: ${JSON.stringify(response)}\n\n`);
    } else {
      const errorResponse = {
        type: 'error',
        content: 'Sorry, I can\'t help with that. Please try again with request related to web3 data.'
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});