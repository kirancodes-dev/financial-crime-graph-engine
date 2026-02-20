import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import CytoscapeComponent from 'react-cytoscapejs';
import { 
  ShieldAlert, Activity, AlertTriangle, X, Database, ShieldBan, 
  Users, Download, Maximize, Sun, Moon, Send, Radio, MapPin, 
  Clock, ArrowUpRight, ArrowDownLeft, Play, FastForward, RefreshCcw, Info, List
} from 'lucide-react';

// --- INTERFACES ---
interface AnalysisResults {
  analytics: { 
    total_transactions: number; 
    flagged_entities: number; 
    freeze_recommendations: number; 
    max_risk_score: number; 
  };
  graph_data: any[]; 
  fraud_rings: any[];
}

function cn(...classes: (string | boolean | undefined)[]) { 
  return classes.filter(Boolean).join(' '); 
}

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  
  // UI Selection States
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeRing, setActiveRing] = useState<any>(null); 
  const [isTracking, setIsTracking] = useState(false);
  
  // AI Chatbot State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Forensic Assistant Online. How can I help?' }]);
  
  const cyRef = useRef<any>(null);

  // --- COLOR PALETTE (Real-World Forensic Standards) ---
  const COLORS = {
    freeze: '#ef4444', // Red for Critical
    flagged: '#f97316', // Orange for Suspicious
    normal: '#1e3a8a',  // Dark Blue for Safe/Rest
  };

  // --- DATA INGESTION ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // UPDATED: Now connects to your live Render Cloud Engine
      const response = await fetch("https://financial-crime-graph-engine.onrender.com/api/analyze", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok || data.error) { 
        alert(`🚨 ENGINE ERROR: ${data.error}`); 
        setLoading(false); 
        return; 
      }
      
      data.graph_data.forEach((el: any) => {
        if (el.data.id && el.data.total_sent !== undefined) el.data.total_volume = el.data.total_sent + el.data.total_received;
        if (el.data.source && el.data.amount) el.data.amount_num = parseFloat(el.data.amount);
      });
      setResults(data);
    } catch (error) {
      alert("🚨 FATAL: Backend connection failed. Check if your Render service is live.");
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  // --- CHRONOLOGICAL TRACK FLOW ---
  const trackFlow = () => {
    if (!cyRef.current || isTracking) return;
    const cy = cyRef.current;
    setIsTracking(true);

    const visibleEdges = cy.edges();
    visibleEdges.addClass('hidden-flow').removeClass('highlighted faded');

    // Sort transactions by timestamp (Earliest to Latest)
    const sorted = visibleEdges.toArray().sort((a: any, b: any) => 
      new Date(a.data('timestamp')).getTime() - new Date(b.data('timestamp')).getTime()
    );

    let i = 0;
    const interval = setInterval(() => {
      if (i >= sorted.length) { 
        clearInterval(interval); 
        setIsTracking(false); 
        cy.fit(); // Stop at final full view
        return; 
      }
      sorted[i].removeClass('hidden-flow').addClass('highlighted');
      sorted[i].connectedNodes().removeClass('faded');
      i++;
    }, 120); 
  };

  // --- CYTOSCAPE STYLING ---
  const cyStylesheet: any = [
    { 
      selector: 'node', 
      style: { 
        'width': 'mapData(total_volume, 0, 100000, 40, 90)', 'height': 'mapData(total_volume, 0, 100000, 40, 90)', 
        'background-color': COLORS.normal, 
        'label': 'data(label)', 'color': theme === 'dark' ? '#f8fafc' : '#0f172a', 
        'font-size': '12px', 'font-weight': 'bold', 'text-valign': 'bottom', 'text-margin-y': 6, 
        'text-background-color': theme === 'dark' ? '#020617' : '#ffffff', 'text-background-opacity': 0.8, 'text-wrap': 'wrap'
      } 
    },
    { selector: 'node[?is_suspicious]', style: { 'background-color': COLORS.flagged, 'border-width': 4, 'border-color': '#ea580c' } }, 
    { selector: 'node[?recommend_freeze]', style: { 'background-color': COLORS.freeze, 'border-width': 6, 'border-color': '#b91c1c', 'shadow-blur': 15, 'shadow-color': COLORS.freeze } }, 
    { selector: 'edge.highlighted', style: { 'line-color': '#0ea5e9', 'line-style': 'dashed', 'line-dash-pattern': [6, 14], 'width': 4, 'opacity': 1 } },
    { selector: '.hidden-flow', style: { 'opacity': 0 } },
    { selector: '.faded', style: { 'opacity': 0.1 } }
  ];

  const layoutConfig = { name: 'cose', idealEdgeLength: 150, nodeOverlap: 20, refresh: 20, fit: true, padding: 50, randomize: true, componentSpacing: 150, nodeRepulsion: 600000, edgeElasticity: 50, nestingFactor: 5, gravity: 80, numIter: 1000 };

  const handleNodeClick = (evt: any) => {
    const nodeData = evt.target.data();
    setSelectedNode(nodeData);
    setActiveRing(null);
  };

  const handleRingClick = (ring: any) => {
    setActiveRing(ring);
    setSelectedNode(null); 
    if (cyRef.current) {
      const cy = cyRef.current;
      const nodes = cy.nodes().filter((n: any) => ring.nodes.includes(n.id()));
      const target = nodes.union(nodes.edgesWith(nodes));
      cy.elements().removeClass('hidden highlighted faded hidden-flow');
      cy.elements().difference(target).addClass('hidden');
      target.addClass('highlighted');
      cy.animate({ fit: { eles: target, padding: 150 }, duration: 800 });
    }
  };

  const handleNewScan = () => { setResults(null); setSelectedNode(null); setActiveRing(null); };

  const handleChat = async () => {
    if (!chatInput.trim() || !results) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput("");
    try {
      // UPDATED: AI Chat now also connects to your live Render Cloud Engine
      const response = await fetch("https://financial-crime-graph-engine.onrender.com/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: userMsg, context: results })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'bot', text: "AI is currently offline." }]);
    }
  };

  return (
    <div className={cn("min-h-screen transition-colors duration-500 font-sans p-4 lg:p-6", theme === 'dark' ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900")}>
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* REBRANDED RESPONSIVE HEADER */}
        <header className="border-b border-slate-800 pb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/30">
              <ShieldAlert size={32} className="text-blue-500" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tighter">FRAUD <span className="text-blue-500 font-light">Detection</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Heuristic Investigation Layer</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            {results && (
              <>
                <button onClick={handleNewScan} className="bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 hover:bg-slate-700 transition-all flex-1 lg:flex-none justify-center">
                  <RefreshCcw size={14}/> Back / New Scan
                </button>
                <button onClick={() => {
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
                  const a = document.createElement('a');
                  a.href = dataStr;
                  a.download = `audit_${Date.now()}.json`;
                  a.click();
                }} className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 hover:bg-blue-500 transition-all flex-1 lg:flex-none justify-center">
                  <Download size={14}/> Audit JSON
                </button>
              </>
            )}
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-3 rounded-full bg-slate-800 text-yellow-400 hover:bg-slate-700 transition-all">
              {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
            </button>
          </div>
        </header>

        {!results ? (
          <div {...getRootProps()} className="border-2 border-dashed border-slate-800 p-20 lg:p-40 text-center rounded-[2rem] cursor-pointer bg-[#0a0f1c]/50 hover:border-blue-500 transition-all shadow-2xl">
            <input {...getInputProps()} />
            <Database size={64} className="mx-auto mb-6 text-blue-500 opacity-80" />
            <h2 className="text-3xl lg:text-4xl font-black">{loading ? "Running Fraud Engine..." : "Initialize Forensic Engine"}</h2>
            <p className="text-slate-500 mt-3 font-medium text-sm">Drop your universal ledger to instantly map suspicious topologies.</p>
          </div>
        ) : (
          <>
            {/* ANALYTICS RIBBON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-4">
              {[
                { label: 'Total Volume', value: results.analytics.total_transactions.toLocaleString(), color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Flagged Entities', value: results.analytics.flagged_entities, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { label: 'Freeze Directives', value: results.analytics.freeze_recommendations, color: 'text-red-500', bg: 'bg-red-500/10' },
                { label: 'Max Risk Score', value: `${results.analytics.max_risk_score} PTS`, color: 'text-white', bg: 'bg-slate-500/10' }
              ].map((stat, i) => (
                <div key={i} className="p-6 rounded-3xl bg-[#0a0f1c] border border-slate-800 shadow-xl">
                  <div className={cn("text-[10px] font-black uppercase mb-2", stat.color)}>{stat.label}</div>
                  <p className="text-3xl lg:text-4xl font-black tracking-tighter text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* MAIN GRAPH & SIDEBAR (Responsive) */}
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 rounded-[2rem] relative h-[50vh] lg:h-[750px] bg-[#070b14] border border-slate-800 shadow-2xl overflow-hidden">
                 <div className="absolute top-4 left-4 z-10 flex gap-3">
                   <button onClick={trackFlow} disabled={isTracking} className={cn("px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-xl", isTracking ? "bg-emerald-600 text-white animate-pulse" : "bg-blue-600 text-white hover:bg-blue-500")}>
                     {isTracking ? <FastForward size={14}/> : <Play size={14}/>} {isTracking ? "Tracing Flow..." : "Track Flow"}
                   </button>
                   {(activeRing || selectedNode) && (
                     <button onClick={() => { setActiveRing(null); setSelectedNode(null); if (cyRef.current) cyRef.current.elements().removeClass('hidden highlighted faded hidden-flow'); }} className="bg-slate-900 px-5 py-2 rounded-full text-xs font-bold border border-slate-700 flex items-center gap-2 text-white">
                       <Maximize size={14}/> Reset View
                     </button>
                   )}
                 </div>
                 <CytoscapeComponent 
                    elements={results.graph_data} 
                    cy={(cy) => { 
                      cyRef.current = cy; 
                      cy.removeAllListeners(); 
                      cy.on('tap', 'node', handleNodeClick); 
                      cy.on('tap', (evt) => { if (evt.target === cy) { setSelectedNode(null); cy.elements().removeClass('faded highlighted'); } }); 
                    }} 
                    style={{ width: '100%', height: '100%' }} 
                    layout={layoutConfig} 
                    stylesheet={cyStylesheet} 
                 />
              </div>

              {/* SIDEBAR */}
              <div className="w-full lg:w-[450px] rounded-[2rem] p-6 bg-[#0a0f1c] border border-slate-800 h-auto lg:h-[750px] overflow-y-auto custom-scrollbar shadow-2xl">
                {activeRing ? (
                  <div className="animate-in slide-in-from-right-8 duration-300">
                      <div className="flex justify-between border-b border-slate-800 pb-4 mb-6">
                        <h3 className="text-blue-500 font-black text-xs uppercase">Ring Summary</h3>
                        <button onClick={() => setActiveRing(null)}><X size={20}/></button>
                      </div>
                      <div className="space-y-4 text-sm font-medium">
                        <p><span className="text-slate-500 uppercase text-[10px] block">Ring ID</span> <span className="text-white font-bold">{activeRing.ring_id}</span></p>
                        <p><span className="text-slate-500 uppercase text-[10px] block">Pattern Type</span> <span className="text-orange-500 font-bold">{activeRing.pattern_type}</span></p>
                        <p><span className="text-slate-500 uppercase text-[10px] block">Member Count</span> <span className="text-white font-bold">{activeRing.member_count}</span></p>
                        <p><span className="text-slate-500 uppercase text-[10px] block">Risk Score</span> <span className="text-red-500 font-black text-2xl">{activeRing.score} PTS</span></p>
                        <div>
                          <span className="text-slate-500 uppercase text-[10px] block mb-2">Member Account IDs</span>
                          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 text-[10px] font-mono break-all text-slate-400">
                            {activeRing.nodes.join(', ')}
                          </div>
                        </div>
                      </div>
                  </div>
                ) : selectedNode ? (
                  <div className="animate-in slide-in-from-right-8 duration-300">
                      <div className="flex justify-between border-b border-slate-800 pb-4 mb-6">
                        <h3 className="text-blue-500 font-black text-xs uppercase">Target Details</h3>
                        <button onClick={() => setSelectedNode(null)}><X size={20}/></button>
                      </div>
                      {selectedNode.recommend_freeze && (<div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-2xl text-[11px] font-black uppercase mb-6 text-center animate-pulse">🛑 Immediate Freeze Recommended</div>)}
                      <div className="space-y-4 mb-8">
                          <div><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Account ID</p><p className="font-mono text-sm text-white bg-slate-900/50 p-3 rounded-xl border border-slate-800 break-all">{selectedNode.id}</p></div>
                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Risk Score</p><p className="font-black text-white text-lg">{selectedNode.risk_score} PTS</p></div>
                              <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800"><p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Jurisdiction</p><p className="font-black text-white text-lg">{selectedNode.country}</p></div>
                          </div>
                          {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                {Object.entries(selectedNode.metadata).map(([k, v]) => (
                                  <div key={k} className="bg-blue-900/10 p-3 rounded-xl border border-blue-500/20">
                                    <p className="text-[9px] text-blue-400 font-bold uppercase mb-1 truncate">{k}</p>
                                    <p className="font-bold text-xs text-white truncate">{String(v)}</p>
                                  </div>
                                ))}
                            </div>
                          )}
                      </div>
                      <h4 className="text-[10px] text-slate-500 font-black uppercase mb-4 flex items-center gap-2"><Clock size={14}/> Transaction Ledger</h4>
                      <div className="space-y-3">
                          {selectedNode.history?.slice(0, 10).map((tx: any, i: number) => (
                              <div key={i} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 flex flex-col gap-1">
                                  <div className="flex justify-between items-center text-xs font-bold">
                                      {tx.type === 'SENT' ? <span className="text-orange-400 flex items-center gap-1"><ArrowUpRight size={12}/> SENT</span> : <span className="text-green-400 flex items-center gap-1"><ArrowDownLeft size={12}/> RCV</span>}
                                      <span className="text-slate-200">${parseFloat(tx.amount).toLocaleString()}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono truncate">Ref: {tx.counterparty}</p>
                              </div>
                          ))}
                      </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-300">
                      <h2 className="text-xs font-black uppercase text-slate-500 mb-6 flex items-center gap-2 border-b border-slate-800 pb-4"><List size={14} className="text-blue-500"/> Risk Leaderboard</h2>
                      <div className="space-y-3">
                        {results.fraud_rings.map((ring: any, i: number) => (
                          <div key={i} onClick={() => handleRingClick(ring)} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 cursor-pointer hover:border-blue-500 transition-all flex flex-col gap-2">
                            <div className="flex justify-between items-center"><p className="font-black text-sm text-white">{ring.ring_id}</p><span className="text-red-500 text-[10px] font-bold">{ring.score} PTS</span></div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">{ring.pattern_type}</p>
                          </div>
                        ))}
                      </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* FLOATING AI CHATBOT */}
      <div className="fixed bottom-4 lg:bottom-8 right-4 lg:right-8 z-50">
        {chatOpen ? (
          <div className="bg-[#0a0f1c] border border-slate-800 w-[90vw] lg:w-80 h-[50vh] lg:h-96 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8">
            <div className="p-4 bg-blue-600 flex justify-between items-center text-white">
              <span className="text-xs font-black uppercase flex items-center gap-2"><Radio size={14} className="animate-pulse"/> Forensic AI</span>
              <button onClick={() => setChatOpen(false)}><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px] font-medium custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={cn("p-3 rounded-2xl max-w-[85%] leading-relaxed", m.role === 'user' ? "bg-blue-600 text-white ml-auto" : "bg-slate-900 border border-slate-800 text-slate-300")}>{m.text}</div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChat()} placeholder="Ask AI..." className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
              <button onClick={handleChat} className="p-2 bg-blue-600 rounded-xl text-white"><Send size={14}/></button>
            </div>
          </div>
        ) : (
          <button onClick={() => setChatOpen(true)} className="bg-blue-600 p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all text-white relative">
            <Activity size={24} />
            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-[#020617] rounded-full animate-pulse"></div>
          </button>
        )}
      </div>
    </div>
  );
}