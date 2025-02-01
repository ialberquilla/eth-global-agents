'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"

export default function Home() {
  const [prompt, setPrompt] = useState("")

  const handleGenerate = () => {
    // TODO: Implement API generation logic
    console.log("Generating API for:", prompt)
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col items-center px-4 py-16">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-500 mb-4">
          Web3 Data Curator
        </h1>
        <p className="text-slate-300 text-lg md:text-xl max-w-2xl mx-auto">
          Describe your data needs, and our AI agent will create your perfect API
        </p>
      </div>

      {/* Main Card */}
      <Card className="w-full max-w-3xl bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="relative">
              <Textarea
                placeholder="e.g., I need to get realtime Uniswap data from 5 chains"
                className="min-h-[120px] resize-none bg-slate-900/50 border-slate-700 text-slate-100 placeholder:text-slate-400"
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              />
              <Button
                className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleGenerate}
              >
                Generate API
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
