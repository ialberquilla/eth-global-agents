'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"

type QueryMapping = {
  field: string
  alias: string
}

type QueryDetails = {
  subgraph: string
  query: string
  mappings?: QueryMapping[]
}

type QueryMetadata = {
  total_subgraphs: number;
  successful_subgraphs: number;
  execution_time_ms: number;
  errors?: Array<{
    subgraphId: string;
    error: string;
  }>;
}

type QueryResult = {
  data: any[];
  metadata: QueryMetadata;
}

type ResponseContent = {
  summary?: string
  details?: string | QueryDetails[] | { id: string } | QueryResult
  recommendedSubgraphs?: Array<{
    id: string
    url: string
    reason: string
    relevanceScore: number
  }>
  suggestedFields?: string[]
  queryOptimizations?: string[]
}

type Response = {
  type?: 'validation' | 'subgraphs' | 'queries' | 'matches' | 'search' | 'error' | 'generatedQuery' | 'queryResult' | 'generatedCode'
  content?: ResponseContent | string
  message?: string
  error?: string
}

export default function Home() {

  const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3000';

  const [prompt, setPrompt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [responses, setResponses] = useState<Response[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryResults, setQueryResults] = useState<any>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    
    setIsLoading(true)
    setResponses([])
    console.log('Starting new request...')

    try {
      const response = await fetch(AGENT_URL + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: prompt }),
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('Stream complete')
          break
        }

        // Convert the chunk to text
        const chunk = new TextDecoder().decode(value)
        console.log('Received chunk:', chunk)
        
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() === '') continue
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            console.log('Processing data line:', data)
            
            if (data === '[DONE]') {
              console.log('Received DONE signal')
              continue
            }

            try {
              const parsedData = JSON.parse(data)
              console.log('Parsed response:', parsedData)
              console.log('Current responses before update:', responses)
              setResponses(prev => {
                console.log('Previous responses in update:', prev)
                const newResponses = [...prev, parsedData]
                console.log('New responses after update:', newResponses)
                return newResponses
              })
            } catch (e) {
              console.error('Error parsing response:', e)
            }
          }
        }
      }

    } catch (error) {
      console.error('Error in request:', error)
      setResponses(prev => [...prev, { error: 'Failed to generate API. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  const executeQuery = async (queryId: string) => {
    setIsExecuting(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002'}/api/subgraphs/execute?id=${queryId}`);
      console.log('Response:', response);
      const data = await response.json() as QueryResult;
      console.log('Query Result Data:', JSON.stringify(data, null, 2));
      
      setQueryResults(data);
    } catch (error) {
      console.error('Error executing query:', error);
      setQueryResults(null);
      setResponses(prev => [...prev, {
        type: 'error',
        content: {
          summary: 'Error executing query',
          details: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      } as Response]);
    } finally {
      setIsExecuting(false)
    }
  }

  const renderResponse = (response: Response, index: number) => {
    if (!response) return null

    if (response.error) {
      return (
        <div key={index} className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
          {response.error}
        </div>
      )
    }

    if (response.type === 'error' && response.content) {
      const content = response.content as ResponseContent
      return (
        <div key={index} className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <h3 className="text-lg font-semibold text-red-500 mb-2">{content.summary}</h3>
          <pre className="whitespace-pre-wrap text-red-400 font-mono text-sm">
            {typeof content.details === 'string' ? content.details : JSON.stringify(content.details, null, 2)}
          </pre>
        </div>
      )
    }

    if ((response.type === 'validation' || response.type === 'subgraphs') && response.content) {
      const content = response.content as ResponseContent
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {content.summary}
          </h3>
          <pre className="whitespace-pre-wrap text-slate-400 font-mono text-sm">
            {typeof content.details === 'string' ? content.details : JSON.stringify(content.details, null, 2)}
          </pre>
        </div>
      )
    }

    if (response.type === 'queries' && response.content) {
      const content = response.content as ResponseContent
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {content.summary}
          </h3>
          <div className="space-y-4">
            {Array.isArray(content.details) && content.details.map((query: QueryDetails, idx: number) => (
              <div key={idx} className="border border-slate-700 rounded-lg p-4">
                <div className="text-slate-300 font-medium mb-2">Subgraph: {query.subgraph}</div>
                <pre className="bg-slate-900/50 p-3 rounded-md text-slate-300 text-sm overflow-x-auto">
                  {query.query}
                </pre>
                {query.mappings && query.mappings.length > 0 && (
                  <div className="mt-3">
                    <div className="text-slate-400 text-sm mb-2">Field Mappings:</div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {query.mappings.map((mapping: QueryMapping, mapIdx: number) => (
                        <div key={mapIdx} className="bg-slate-900/30 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs">
                          <span className="text-slate-400 font-medium">{mapping.field}</span>
                          <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="text-slate-300">{mapping.alias}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (response.message) {
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
          <div className="text-slate-200">{response.message}</div>
        </div>
      )
    }

    if (response.type === 'generatedQuery' && response.content) {
      const content = response.content as ResponseContent;
      const queryId = content.details && typeof content.details === 'object' ? (content.details as { id: string }).id : '';
      
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="h-4 w-1 bg-slate-200 rounded-full"></div>
                <h3 className="text-xl font-bold text-slate-200">
                  Generated Query
                </h3>
              </div>
              <p className="text-slate-400 text-sm ml-5">
                Generated aggregated query with standard requirements.
              </p>
            </div>
            <pre className="bg-slate-900/50 p-4 rounded-md text-slate-300 text-sm overflow-x-auto whitespace-pre-wrap font-mono">
              {content.summary}
            </pre>
            <Button 
              onClick={() => executeQuery(queryId)}
              disabled={isExecuting}
              className="bg-blue-500 hover:bg-blue-600 text-white w-fit"
            >
              {isExecuting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Executing...</span>
                </div>
              ) : (
                'Execute Query'
              )}
            </Button>
            {queryResults && (
              <div className="mt-4">
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-700 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50 hover:scrollbar-thumb-slate-600">
                  <pre className="bg-slate-900/50 p-4 text-slate-300 text-sm font-mono whitespace-pre overflow-x-auto">
                    {JSON.stringify(queryResults.data, null, 2)}
                  </pre>
                </div>
                <div className="mt-2 text-sm text-slate-400 flex gap-4">
                  <span>Total Subgraphs: {queryResults.metadata.total_subgraphs}</span>
                  <span>Successful: {queryResults.metadata.successful_subgraphs}</span>
                  <span>Execution Time: {queryResults.metadata.execution_time_ms}ms</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    if (response.type === 'queryResult' && response.content) {
      const content = response.content as ResponseContent;
      const queryResult = content.details as QueryResult;
      console.log('Rendering query result:', content);
      
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-4 w-1 bg-slate-200 rounded-full"></div>
            <h3 className="text-xl font-bold text-slate-200">
              {content.summary}
            </h3>
          </div>
          <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-700 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50 hover:scrollbar-thumb-slate-600">
            <pre className="bg-slate-900/50 p-4 text-slate-300 text-sm font-mono whitespace-pre overflow-x-auto">
              {JSON.stringify(queryResult.data, null, 2)}
            </pre>
          </div>
          {/* Add metadata display */}
          <div className="mt-2 text-sm text-slate-400">
            <p>Total Subgraphs: {queryResult.metadata.total_subgraphs}</p>
            <p>Successful: {queryResult.metadata.successful_subgraphs}</p>
            <p>Execution Time: {queryResult.metadata.execution_time_ms}ms</p>
            {queryResult.metadata.errors && queryResult.metadata.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-red-400">Errors:</p>
                <ul className="list-disc list-inside">
                  {queryResult.metadata.errors.map((error: { subgraphId: string; error: string }, i: number) => (
                    <li key={i} className="text-red-400">
                      {error.subgraphId}: {error.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )
    }

    if (response.type === 'generatedCode' && response.content) {
      const content = response.content as ResponseContent;
      return (
        <div key={index} className="p-4 bg-slate-800/50 rounded-lg space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-4 w-1 bg-slate-200 rounded-full"></div>
              <h3 className="text-xl font-bold text-slate-200">
                {content.summary}
              </h3>
            </div>
            <p className="text-slate-400 text-sm ml-5">
              Use this code to integrate the query with Coinbase Agent Kit
            </p>
          </div>
          <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-700 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50 hover:scrollbar-thumb-slate-600">
            <pre className="bg-slate-900/50 p-4 text-slate-300 text-sm font-mono whitespace-pre">
              {typeof content.details === 'string' ? content.details : JSON.stringify(content.details, null, 2)}
            </pre>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col items-center px-4 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 tracking-tight">
          Web3 Data Curator
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
          Start building for free, then scale to millions of users
        </p>
      </div>

      {/* Main Input Section */}
      <Card className="w-full max-w-4xl bg-slate-900/50 border-slate-800 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl text-slate-200">Describe your data needs</CardTitle>
          <CardDescription className="text-slate-400">Our AI agent will create your perfect API</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="relative">
              <Textarea
                placeholder="e.g., I need to get realtime Uniswap data from 5 chains"
                className="min-h-[120px] resize-none bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500"
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              />
              <Button
                className="absolute bottom-4 right-4 bg-[#24A1E9] hover:bg-[#24A1E9]/90 text-white font-medium border-0"
                onClick={handleGenerate}
                disabled={isLoading}
              >
                {isLoading ? 'Generating...' : 'Generate API'}
              </Button>
            </div>
          </div>

          {/* Response Section */}
          <div className="mt-6 space-y-4">
            {responses.map((response, index) => renderResponse(response, index))}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
