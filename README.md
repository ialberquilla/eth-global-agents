# Datrix

An intelligent system that autonomously curates and combines web3 data sources based on natural language requests. This agent-based platform simplifies access to cross-chain data by automatically analyzing user requirements and orchestrating relevant subgraph combinations from The Graph protocol.

## 🤖 Key Features

- Natural language processing for web3 data requirements
- Autonomous data source discovery and combination
- Multi-chain data integration
- Dynamic subgraph selection and orchestration
- Real-time data aggregation capabilities

## 💡 How It Works

1. Users describe their data needs in plain English
2. AI agent analyzes the request and identifies required data points
3. System automatically discovers and evaluates relevant subgraphs
4. Data sources are combined to create a unified dataset
5. Results are delivered in a ready-to-use format

## 🎯 Perfect For

- DeFi developers needing multi-chain data
- Data analysts working with web3 metrics
- AI/ML practitioners building web3-powered applications
- Researchers requiring comprehensive blockchain data

## 🛠️ Tech Stack

- AI-powered request analysis
- The Graph Protocol integration
- Multi-chain data aggregation
- Autonomous agent architecture

## 📋 Prerequisites

- Node.js >= 16.x
- Access to The Graph API
- OpenAI API key for NLP processing

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/web3-data-curator.git

# Install dependencies
cd web3-data-curator
npm install

# Configure environment variables
cp .env.example .env
# Add your API keys to .env

# Start the service
npm run start
```


An AI agent to allow users to find the best subgraphs to query on-chain data and aggregate them to optimize query execution.
## 📁 Project Structure

The project is organized into three main directories:

- `/agent` - Contains the agent implementation using Coinbase Agent Kit
  - `server.ts` - Main agent server implementation
  - `templates/` - Coinbase agent templates to generate code
  - `vercel.json` - Vercel deployment configuration

- `/backend` - NestJS backend service for subgraph management and query storage
  - `src/`
    - `modules/supabase/` - Supabase integration for data storage
    - `main.ts` - Application entry point
    - `app.module.ts` - Main application module
  - `vercel.json` - Vercel deployment configuration

- `/frontend` - Next.js frontend application with ChatGPT-style interface
  - `src/`
    - `app/` - Next.js app router components
    - `components/` - Reusable UI components
  - `public/` - Static assets

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- A Postgres database
- Gemini API key
- The Graph API key
- Supabase account and project

### Installation

1. Clone the repository:

```bash
git clone https://github.com/ialberquilla/eth-global-agents
```

2. Install dependencies for each service:

```bash
# Install agent dependencies
cd agent
npm install

# Install backend dependencies
cd ../backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Set up environment variables:

Create `.env` files in each directory with the following variables:

**Backend (.env)**
```
GOOGLE_AI_API_KEY=your_google_ai_api_key
DB_PASSWORD=your_database_password
SUPABASE_URL=your_supabase_url
THEGRAPH_API_KEY=your_thegraph_api_key
```

**Agent (.env)**
```
GOOGLE_API_KEY=your_google_api_key
CDP_API_KEY_NAME=your_cdp_api_key_name
CDP_API_KEY_PRIVATE_KEY=your_cdp_private_key
BACKEND_URL=http://localhost:3002
```

**Frontend (.env)**
```
AGENT_URL=http://localhost:3000
```

4. Start the services:

```bash
# Start the agent (from /agent directory)
npm run dev

# Start the backend (from /backend directory)
npm run start:dev

# Start the frontend (from /frontend directory)
npm run dev
```

The application should now be running with:
- Frontend: http://localhost:3001
- Backend: http://localhost:3002
- Agent: http://localhost:3000

## 🔑 API Keys and Services Setup

1. **Gemini API Key**:
   - Visit Google AI Studio to get your API key
   - Set it as `GOOGLE_AI_API_KEY` in backend/.env

2. **The Graph API Key**:
   - Create an account on The Graph
   - Generate an API key
   - Set it as `THEGRAPH_API_KEY` in backend/.env

3. **Supabase Setup**:
   - Create a new project in Supabase
   - Get your project URL
   - Set it as `SUPABASE_URL` in backend/.env

4. **CDP API Keys**:
   - Follow Coinbase documentation to generate CDP API keys
   - Set the key name and private key in agent/.env