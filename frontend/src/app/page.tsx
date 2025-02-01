'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"

export default function Home() {
  const [prompt, setPrompt] = useState("")

  const handleGenerate = () => {
    // TODO: Implement API generation logic
    console.log("Generating API for:", prompt)
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
