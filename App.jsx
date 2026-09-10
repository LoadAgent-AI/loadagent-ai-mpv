import React, { useState } from 'react';
import { 
  Truck, Zap, Menu, X, ArrowUpRight, CheckCircle2, Clock, 
  DollarSign, FileText, Play, ShieldCheck, ChevronRight 
} from 'lucide-react';

export default function LoadAgentMVP() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState(
    "Load #LA-9026 from Houston, TX to Nashville, TN. Offered rate: $2,450. Equipment: 53 Dry Van. Pickup today."
  );

  // Email Parsing Logic
  const parseAndNegotiate = (emailText) => {
    const loadIdMatch = emailText.match(/Load\s*#?\s*:?\s*([A-Za-z0-9-]+)/i);
    const loadId = loadIdMatch ? loadIdMatch[1] : "LA-9026";

    const routeMatch = emailText.match(/([A-Za-z\s]+,\s*[A-Z]{2})\s*(?:to|->|➔|-)\s*([A-Za-z\s]+,\s*[A-Z]{2})/i);
    const origin = routeMatch ? routeMatch[1].trim() : "Houston, TX";
    const dest = routeMatch ? routeMatch[2].trim() : "Nashville, TN";

    const rateMatch = emailText.match(/\$\s*([0-9,]+)/);
    const offeredRate = rateMatch ? parseInt(rateMatch[1].replace(',', '')) : 2450;

    const counterRate = Math.round(offeredRate * 1.15);
    const profitGain = counterRate - offeredRate;

    return {
      id: `#${loadId}`,
      route: `${origin} ➔ ${dest}`,
      offered: `$${offeredRate.toLocaleString()}`,
      counter: `$${counterRate.toLocaleString()}`,
      gain: `+$${profitGain.toLocaleString()}`,
      status: "Negotiating"
    };
  };

  const [activeLoads, setActiveLoads] = useState([
    parseAndNegotiate(inputEmail),
    { id: '#LA-9021', route: 'Chicago, IL ➔ Atlanta, GA', offered: '$2,300', counter: '$2,650', gain: '+$350', status: 'Confirmed' },
    { id: '#LA-9023', route: 'Dallas, TX ➔ Denver, CO', offered: '$2,800', counter: '$3,150', gain: '+$350', status: 'Rate Con Sent' }
  ]);

  const [logs, setLogs] = useState([
    { id: 1, time: '10:34 AM', text: 'Email parsed for #LA-9026 ($2,450 initial offer)' },
    { id: 2, time: '10:34 AM', text: 'AI Agent countered with $2,818 based on DAT lane data (+$368 profit)' },
    { id: 3, time: '10:35 AM', text: 'Auto-generated Rate Confirmation request sent to broker' }
  ]);

  const handleParse = () => {
    if (!inputEmail) return;
    const newLoad = parseAndNegotiate(inputEmail);
    setActiveLoads([newLoad, ...activeLoads]);
    
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `Parsed new load ${newLoad.id} (${newLoad.offered} -> Counter: ${newLoad.counter})`
    };
    setLogs([newLog, ...logs]);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans antialiased">
      {/* HEADER */}
      <header className="h-16 border-b border-slate-800 bg-[#0F172A] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden text-slate-400 p-1">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white">LoadAgent AI</span>
          <span className="bg-teal-500/10 text-teal-400 text-xs px-2 py-0.5 rounded border border-teal-500/30">V1.0 MVP</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-xs text-slate-300">AI Engine Online</span>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <main className="flex-1 p-4 lg:p-6 space-y-6">
          {/* STATS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Active Loads Monitored</span>
              <p className="text-2xl font-bold text-white mt-1">34</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">Pending Rate Cons</span>
              <p className="text-2xl font-bold text-white mt-1">8</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
              <span className="text-xs text-slate-400">AI Auto-Negotiated Profit</span>
              <p className="text-2xl font-bold text-teal-400 mt-1">+$14,250</p>
            </div>
          </div>

          {/* PARSER INPUT PANEL */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Copilot Email Parser</span>
              <span className="text-[11px] text-slate-500">Paste broker email -> AI extracts & counters +15% DAT rate</span>
            </div>
            <textarea 
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 h-20 resize-none font-mono"
            />
            <button 
              onClick={handleParse}
              className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition"
            >
              <Zap className="w-4 h-4" /> Parse & Negotiate Load
            </button>
          </div>

          {/* DISPATCH QUEUE */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-white">Active Dispatch Queue</h2>
            <div className="space-y-2">
              {activeLoads.map((load, index) => (
                <div key={index} className="bg-slate-800/40 border border-slate-800 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-400 text-xs">{load.id}</span>
                      <span className="text-xs font-semibold text-slate-200">{load.route}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400">Offer: <span className="line-through">{load.offered}</span></span>
                    <span className="font-bold text-emerald-400">AI: {load.counter}</span>
                    <span className="bg-teal-500/10 text-teal-400 font-bold px-2 py-0.5 rounded text-[10px]">{load.gain}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* LOGS SIDEBAR */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-800 bg-[#0F172A]/50 p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Zap className="w-4 h-4 text-teal-400" />
            <h3 className="font-bold text-xs text-white uppercase tracking-wider">Live AI Agent Logs</h3>
          </div>
          <div className="space-y-2 font-mono text-[11px]">
            {logs.map((log) => (
              <div key={log.id} className="bg-slate-900/90 border border-slate-800 p-2.5 rounded">
                <span className="text-slate-500 text-[10px] block">{log.time}</span>
                <p className="text-slate-300 font-sans mt-1">{log.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
