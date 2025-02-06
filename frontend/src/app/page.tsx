'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState, useCallback } from "react"

type ResponseContent = {
  summary?: string
  details?: string | any[]
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
  type?: 'validation' | 'subgraphs' | 'queries' | 'matches' | 'search' | 'error'
  content?: ResponseContent | string
  message?: string
  error?: string
}

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [responses, setResponses] = useState<Response[]>([])

  const addResponse = useCallback((newResponse: Response) => {
    setResponses(prev => [...prev, newResponse])
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    
    setIsLoading(true)
    setResponses([])
    console.log('Starting new request...')

    try {
      const response = await fetch('http://localhost:3000/chat', {
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
            {content.details}
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
            {content.details}
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
            {Array.isArray(content.details) && content.details.map((query: any, idx: number) => (
              <div key={idx} className="border border-slate-700 rounded-lg p-4">
                <div className="text-slate-300 font-medium mb-2">Subgraph: {query.subgraph}</div>
                <pre className="bg-slate-900/50 p-3 rounded-md text-slate-300 text-sm overflow-x-auto">
                  {query.query}
                </pre>
                {query.mappings && query.mappings.length > 0 && (
                  <div className="mt-3">
                    <div className="text-slate-400 text-sm mb-2">Field Mappings:</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {query.mappings.map((mapping: any, mapIdx: number) => (
                        <div key={mapIdx} className="bg-slate-900/30 p-2 rounded">
                          <span className="text-slate-400">{mapping.field}</span>
                          <span className="text-slate-500 mx-2">→</span>
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
