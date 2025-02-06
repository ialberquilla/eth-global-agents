'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"

type ResponseContent = {
  summary?: string
  details?: string
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
  type?: 'validation' | 'subgraphs' | 'matches' | 'search' | 'error'
  content?: ResponseContent | string
  message?: string
  error?: string
}

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [responses, setResponses] = useState<Response[]>([])

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    
    setIsLoading(true)
    setResponses([])

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Convert the chunk to text
        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')

        // Process each line
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') return

            try {
              const parsedData = JSON.parse(data)
              setResponses(prev => [...prev, parsedData])
            } catch (e) {
              // Handle plain text responses
              setResponses(prev => [...prev, { message: data }])
            }
          }
        })
      }
    } catch (error) {
      console.error('Error generating API:', error)
      setResponses([{ error: 'Failed to generate API. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  const renderResponse = () => {
    if (responses.length === 0) return null

    return (
      <div className="mt-6 space-y-4">
        {responses.map((response, index) => {
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

          if (response.type === 'validation' && response.content) {
            return (
              <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {(response.content as ResponseContent).summary}
                </h3>
                <pre className="whitespace-pre-wrap text-slate-400 font-mono text-sm">
                  {(response.content as ResponseContent).details}
                </pre>
              </div>
            )
          }

          if (response.type === 'subgraphs' && response.content) {
            return (
              <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">
                  {(response.content as ResponseContent).summary}
                </h3>
                <pre className="whitespace-pre-wrap text-slate-400 font-mono text-sm">
                  {(response.content as ResponseContent).details}
                </pre>
              </div>
            )
          }

          if (response.type === 'matches' && response.content) {
            return (
              <div key={index}>
                <h3 className="text-lg font-semibold text-slate-200">Recommended Subgraphs:</h3>
                <div className="space-y-3">
                  {(response.content as ResponseContent).recommendedSubgraphs?.map((subgraph, idx) => (
                    <div key={idx} className="p-4 bg-slate-800/50 rounded-lg">
                      <div className="font-medium text-slate-200">{subgraph.url}</div>
                      <div className="text-sm text-slate-400 mt-1">{subgraph.reason}</div>
                      <div className="text-sm text-slate-500 mt-1">Relevance: {subgraph.relevanceScore}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          if (response.type === 'search' && response.content) {
            return (
              <div key={index} className="p-4 bg-slate-800/50 rounded-lg">
                <div className="text-slate-200">{response.content.toString()}</div>
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
        })}
      </div>
    )
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
          {renderResponse()}
        </CardContent>
      </Card>
    </main>
  )
}
