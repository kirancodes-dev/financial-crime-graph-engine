import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import CytoscapeComponent from 'react-cytoscapejs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { 
  ShieldAlert, Activity, AlertTriangle, X, Database, ShieldBan, 
  Users, Download, Maximize, Sun, Moon, Send, Radio, MapPin, 
  Clock, ArrowUpRight, ArrowDownLeft, Play, FastForward, RefreshCcw, Info, List,
  Search, Filter, FileText, Zap, Keyboard, BarChart2
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && window.location.port === "5173" ? "http://localhost:8000" : "");

// --- INTERFACES ---
interface AnalysisResults {
  analytics: { 
    total_transactions: number; 
    flagged_entities: number; 
    freeze_recommendations: number; 
    max_risk_score: number;
    avg_risk_score: number;
    network_density: number;
    clustering_coefficient: number;
    fraud_pattern_count: number;
  };
  graph_data: any[];
  fraud_rings: any[];
  timeline: { date: string; volume: number; count: number; flagged: number }[];
  fraud_type_breakdown: Record<string, number>;
  flagged_entities: any[];
}

function cn(...classes: (string | boolean | undefined)[]) { 
  return classes.filter(Boolean).join(' '); 
}

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [loadingPct, setLoadingPct] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  
  // UI Selection States
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeRing, setActiveRing] = useState<any>(null); 
  const [isTracking, setIsTracking] = useState(false);
  
  // New Features States
  const [searchQuery, setSearchQuery] = useState("");
  const [minRisk, setMinRisk] = useState(0);
  const [isTurbo, setIsTurbo] = useState(false);

  // AI Chatbot State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Forensic Assistant Online. How can I help?' }]);
  
  const cyRef = useRef<any>(null);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') { if (results) handleNewScan(); }
      if (e.key === 'f' || e.key === 'F') { if (cyRef.current) cyRef.current.fit(50); }
      if (e.key === 't' || e.key === 'T') { setIsTurbo(prev => !prev); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [results]);

  // --- CSV EXPORT ---
  const exportFlaggedCSV = () => {
    window.open(`${API_URL}/api/export/flagged`, '_blank');
  };

  // --- COLOR PALETTE (Real-World Forensic Standards) ---
  const COLORS = {
    freeze: '#ef4444', // Red for Critical
    flagged: '#f97316', // Orange for Suspicious
    normal: '#1e3a8a',  // Dark Blue for Safe/Rest
  };

  // --- TOAST HELPER ---
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // --- STAGED LOADER HELPER ---
  const runWithProgress = async (fetchFn: () => Promise<Response>) => {
    setLoading(true);
    setLoadingPct(10); setLoadingStage("Uploading ledger...");
    let pct = 10;
    const tick = setInterval(() => {
      pct = Math.min(pct + 6, 80);
      setLoadingPct(pct);
      if (pct < 30) setLoadingStage("Uploading ledger...");
      else if (pct < 60) setLoadingStage("Running fraud engine...");
      else setLoadingStage("Building graph topology...");
    }, 300);
    try {
      const response = await fetchFn();
      clearInterval(tick);
      setLoadingPct(90); setLoadingStage("Rendering results...");
      const data = await response.json();
      if (!response.ok || data.error) {
        showToast(`🚨 Engine error: ${data.error || response.statusText}`);
        return;
      }
      data.graph_data.forEach((el: any) => {
        if (el.data.id && el.data.total_sent !== undefined) el.data.total_volume = el.data.total_sent + el.data.total_received;
        if (el.data.source && el.data.amount) el.data.amount_num = parseFloat(el.data.amount);
      });
      if (data.cached) showToast("⚡ Instant result — loaded from cache");
      setResults(data);
      setLoadingPct(100);
    } catch (err) {
      clearInterval(tick);
      showToast(`🚨 Cannot reach backend at ${API_URL} — is the server running?`);
    } finally {
      clearInterval(tick);
      setTimeout(() => { setLoading(false); setLoadingPct(0); setLoadingStage(""); }, 400);
    }
  };

  // --- DATA INGESTION ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await runWithProgress(() => fetch(`${API_URL}/api/analyze`, { method: "POST", body: formData }));
  }, []);

  // --- DEMO LOADER ---
  const handleLoadDemo = async (mode: 'fiat' | 'crypto' = 'fiat') => {
    await runWithProgress(() => fetch(`${API_URL}/api/demo?mode=${mode}`));
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  // --- FILTERING LOGIC ---
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    cy.batch(() => {
      cy.nodes().forEach((node: any) => {
        const data = node.data();
        const matchesSearch = !searchQuery || data.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRisk = (data.risk_score || 0) >= minRisk;
        
        if (matchesSearch && matchesRisk) {
          node.removeClass('hidden');
        } else {
          node.addClass('hidden');
        }
      });
    });
  }, [searchQuery, minRisk, results]);

  // --- CHRONOLOGICAL TRACK FLOW ---
  const trackFlow = () => {
    if (!cyRef.current || isTracking) return;
    const cy = cyRef.current;
    setIsTracking(true);

    const visibleEdges = cy.edges();
    visibleEdges.addClass('hidden-flow').removeClass('highlighted faded');

    const sorted = visibleEdges.toArray().sort((a: any, b: any) => 
      new Date(a.data('timestamp')).getTime() - new Date(b.data('timestamp')).getTime()
    );

    let i = 0;
    const interval = setInterval(() => {
      if (i >= sorted.length) { 
        clearInterval(interval); 
        setIsTracking(false); 
        cy.fit(); 
        return; 
      }
      sorted[i].removeClass('hidden-flow').addClass('highlighted');
      sorted[i].connectedNodes().removeClass('faded');
      i++;
    }, isTurbo ? 20 : 120); 
  };

  // --- PDF EXPORT ---
  const generatePDF = async () => {
    try {
      showToast("ℹ️ Rendering forensic report PDF...");
      const element = document.getElementById("dashboard-content");
      if (!element) {
        showToast("❌ Dashboard element not found.");
        return;
      }
      
      const canvas = await html2canvas(element, { 
        scale: 1.5, 
        backgroundColor: '#020617',
        useCORS: true,
        allowTaint: true,
        logging: false
      });
      const imgData = canvas.toDataURL("image/png");
      
      const pdf = new jsPDF("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`RIFT_Forensic_Report_${Date.now()}.pdf`);
      showToast("✅ Forensic Report PDF downloaded!");
    } catch (err: any) {
      console.error("PDF Export Error:", err);
      showToast(`❌ PDF Export failed: ${err.message || err}`);
    }
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
    // Fraud-type-aware coloring
    { selector: 'node[fraud_type = "VELOCITY_BURST"]', style: { 'background-color': '#eab308', 'border-width': 3, 'border-color': '#ca8a04' } },
    { selector: 'node[fraud_type = "ROUND_TRIP"]',    style: { 'background-color': '#a855f7', 'border-width': 3, 'border-color': '#9333ea' } },
    { selector: 'node[fraud_type = "SHADOW_BOSS"]',   style: { 'background-color': '#ef4444', 'border-width': 5, 'border-color': '#b91c1c', 'shadow-blur': 20, 'shadow-color': '#ef4444' } },
    { selector: 'node[?is_suspicious]', style: { 'background-color': COLORS.flagged, 'border-width': 4, 'border-color': '#ea580c' } }, 
    { selector: 'node[?recommend_freeze]', style: { 'background-color': COLORS.freeze, 'border-width': 6, 'border-color': '#b91c1c', 'shadow-blur': 15, 'shadow-color': COLORS.freeze } }, 
    { selector: 'edge[?is_fraudulent]',   style: { 'line-color': '#f97316', 'width': 3, 'opacity': 0.9 } },
    { selector: 'edge.highlighted', style: { 'line-color': '#0ea5e9', 'line-style': 'dashed', 'line-dash-pattern': [6, 14], 'width': 4, 'opacity': 1 } },
    { selector: '.hidden-flow', style: { 'opacity': 0 } },
    { selector: '.faded', style: { 'opacity': 0.1 } },
    { selector: '.hidden', style: { 'display': 'none' } }
  ];

  const layoutConfig = { 
    name: 'cose', idealEdgeLength: 150, nodeOverlap: 20, refresh: 20, fit: true, padding: 50, 
    randomize: true, componentSpacing: 150, nodeRepulsion: 600000, edgeElasticity: 50, 
    nestingFactor: 5, gravity: 80, numIter: isTurbo ? 100 : 1000, animate: !isTurbo 
  };

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
      cy.animate({ fit: { eles: target, padding: 150 }, duration: isTurbo ? 0 : 800 });
    }
  };

  const handleNewScan = () => { setResults(null); setSelectedNode(null); setActiveRing(null); };

  const handleChat = async () => {
    if (!chatInput.trim() || !results) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput("");
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: userMsg, context: results })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'bot', text: "AI is currently offline." }]);
    }
  };

  return (
    <div className={cn("min-h-screen transition-colors duration-500 p-4 lg:p-6 bg-gradient-animate", theme === 'dark' ? "bg-[linear-gradient(135deg,#020617_0%,#0f172a_50%,#020617_100%)] text-slate-200" : "bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_50%,#f8fafc_100%)] text-slate-900")}>
      {/* PROGRESS BAR */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 z-[100]">
          <div className="h-1 bg-slate-800">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-300 ease-out" style={{ width: `${loadingPct}%` }} />
          </div>
          <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 text-xs text-blue-300 font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            {loadingStage}
          </div>
        </div>
      )}
      {/* TOAST */}
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] bg-slate-800 border border-slate-600 text-white text-xs font-bold px-5 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-4 duration-300">
          {toastMsg}
        </div>
      )}
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* REBRANDED RESPONSIVE HEADER */}
        <header className="glass-panel rounded-2xl p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
          <div className="flex items-center gap-5">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <ShieldAlert size={36} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-5xl font-black uppercase tracking-tighter font-heading text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">FRAUD <span className="text-white font-light">Detection</span></h1>
              <p className="text-xs uppercase tracking-widest text-blue-400/80 font-bold mt-1">Heuristic Investigation Layer</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            {results && (
              <>
                <button onClick={() => setIsTurbo(!isTurbo)} className={cn("px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-lg", isTurbo ? "bg-amber-500 text-slate-900" : "bg-slate-800/80 backdrop-blur-md border border-slate-700 text-white hover:bg-slate-700")}>
                  <Zap size={16}/> {isTurbo ? "Turbo ON" : "Turbo Mode"}
                </button>
                <button onClick={handleNewScan} className="bg-slate-800/80 backdrop-blur-md border border-slate-700 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 hover:bg-slate-700 hover:border-slate-500 transition-all flex-1 lg:flex-none justify-center">
                  <RefreshCcw size={16}/> New Scan
                </button>
                <button onClick={generatePDF} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-[0_4px_15px_rgba(59,130,246,0.4)] flex items-center gap-2 hover:shadow-[0_6px_25px_rgba(59,130,246,0.6)] hover:-translate-y-0.5 transition-all flex-1 lg:flex-none justify-center">
                  <FileText size={16}/> Export PDF
                </button>
                <button onClick={exportFlaggedCSV} className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-[0_4px_15px_rgba(249,115,22,0.4)] flex items-center gap-2 hover:shadow-[0_6px_25px_rgba(249,115,22,0.6)] hover:-translate-y-0.5 transition-all flex-1 lg:flex-none justify-center">
                  <Download size={16}/> Flagged CSV
                </button>
              </>
            )}
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-3 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700 text-yellow-400 hover:bg-slate-700 hover:text-yellow-300 transition-all shadow-lg">
              {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
            </button>
          </div>
        </header>

        {/* SEARCH & FILTER BAR */}
        {results && (
          <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row gap-6 items-center animate-in slide-in-from-top-4">
            <div className="flex-1 w-full flex items-center gap-3 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2">
              <Search size={18} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Search Account ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:outline-none text-white text-sm w-full"
              />
            </div>
            <div className="flex items-center gap-4 w-full md:w-1/3">
              <Filter size={18} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Min Risk Score: {minRisk}</span>
              <input 
                type="range" min="0" max="100" step="10" 
                value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} 
                className="w-full accent-blue-500" 
              />
            </div>
            {/* KEYBOARD SHORTCUTS HINT */}
            <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 font-medium">
              <Keyboard size={14} />
              <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">R</kbd> Scan</span>
              <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">F</kbd> Fit</span>
              <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">T</kbd> Turbo</span>
            </div>
          </div>
        )}

        {!results ? (
          <div className="space-y-4">
            <div {...getRootProps()} className="glass-panel border-2 border-dashed border-blue-500/30 p-16 lg:p-32 text-center rounded-[2.5rem] cursor-pointer hover:border-blue-400 hover:bg-blue-900/10 transition-all shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <input {...getInputProps()} />
              <Database size={72} className="mx-auto mb-8 text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)] group-hover:scale-110 transition-transform duration-500" />
              <h2 className="text-4xl lg:text-5xl font-black font-heading text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-4">
                {loading ? loadingStage || "Analyzing..." : "Initialize Forensic Engine"}
              </h2>
              <p className="text-blue-300/70 text-lg font-medium">Drop a CSV ledger to instantly map suspicious topologies.</p>
            </div>
            {/* QUICK DEMO BUTTONS */}
            {!loading && (
              <div className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row gap-3 items-center justify-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">— or try a demo —</p>
                <button onClick={() => handleLoadDemo('fiat')} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-lg hover:-translate-y-0.5 transition-all">
                  <Zap size={14}/> Fiat Banking Demo
                </button>
                <button onClick={() => handleLoadDemo('crypto')} className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-lg hover:-translate-y-0.5 transition-all">
                  <Activity size={14}/> Crypto Ledger Demo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div id="dashboard-content">
            {/* ANALYTICS RIBBON */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 animate-in slide-in-from-top-4 mb-4">
              {[
                { label: 'Total Volume', value: results.analytics.total_transactions.toLocaleString(), color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Flagged Entities', value: results.analytics.flagged_entities, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { label: 'Freeze Directs', value: results.analytics.freeze_recommendations, color: 'text-red-500', bg: 'bg-red-500/10' },
                { label: 'Max Risk', value: `${results.analytics.max_risk_score} PTS`, color: 'text-white', bg: 'bg-slate-500/10' },
                { label: 'Avg Risk', value: `${results.analytics.avg_risk_score} PTS`, color: 'text-slate-300', bg: 'bg-slate-500/10' },
                { label: 'Network Density', value: results.analytics.network_density, color: 'text-slate-300', bg: 'bg-slate-500/10' }
              ].map((stat, i) => (
                <div key={i} className="glass-card p-4 rounded-2xl relative overflow-hidden group">
                  <div className={`absolute top-0 right-0 w-24 h-24 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity ${stat.bg}`}></div>
                  <div className={cn("text-[10px] font-black uppercase mb-1 tracking-widest", stat.color)}>{stat.label}</div>
                  <p className="text-2xl lg:text-3xl font-black tracking-tighter text-white font-heading">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* TIMELINE SPARKLINE & FRAUD TYPE BREAKDOWN */}
            <div className="glass-panel p-4 rounded-2xl mb-6 flex flex-col lg:flex-row gap-6 items-center">
              <div className="flex-1 w-full">
                <div className="text-[10px] font-black uppercase mb-2 tracking-widest text-slate-400 flex items-center gap-2">
                  <BarChart2 size={12} /> Transaction Timeline (Flags Overlay)
                </div>
                <div className="flex items-end h-12 gap-1 w-full opacity-80 hover:opacity-100 transition-opacity">
                  {results.timeline?.map((day, i) => {
                    const maxVol = Math.max(...results.timeline.map(d => d.volume), 1);
                    const hPct = Math.max((day.volume / maxVol) * 100, 5);
                    const isFlagged = day.flagged > 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col justify-end group/bar relative">
                        {isFlagged && <div className="w-full bg-red-500/50 mb-0.5 rounded-sm h-1" />}
                        <div className={cn("w-full rounded-sm transition-all", isFlagged ? "bg-orange-500" : "bg-blue-500/40")} style={{ height: `${hPct}%` }}></div>
                        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-slate-800 text-xs text-white p-2 rounded hidden group-hover/bar:block z-50 whitespace-nowrap shadow-xl border border-slate-600">
                          {day.date}<br/>Vol: ${day.volume.toLocaleString()}<br/>Flags: {day.flagged}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="lg:w-1/3 w-full border-l border-slate-700/50 pl-6 flex flex-wrap gap-2 items-center">
                <div className="w-full text-[10px] font-black uppercase mb-1 tracking-widest text-slate-400">Detected Patterns</div>
                {Object.entries(results.fraud_type_breakdown || {}).map(([type, count]) => (
                  <div key={type} className="px-2 py-1 rounded-md text-[10px] font-bold border flex gap-1 items-center bg-slate-800/50 border-slate-600 text-slate-300">
                    <span className={cn("w-2 h-2 rounded-full", type === 'VELOCITY_BURST' ? 'bg-yellow-500' : type === 'ROUND_TRIP' ? 'bg-purple-500' : 'bg-orange-500')}></span>
                    {type} ({count as React.ReactNode})
                  </div>
                ))}
              </div>
            </div>

            {/* MAIN GRAPH & SIDEBAR */}
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 rounded-[2.5rem] relative h-[50vh] lg:h-[750px] glass-panel overflow-hidden border border-slate-700/50 shadow-2xl">
                 <div className="absolute top-6 left-6 z-10 flex gap-3">
                   <button onClick={trackFlow} disabled={isTracking} className={cn("px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-xl", isTracking ? "bg-emerald-600 text-white animate-pulse" : "bg-blue-600 text-white hover:bg-blue-500")}>
                     {isTracking ? <FastForward size={14}/> : <Play size={14}/>} {isTracking ? "Live Streaming..." : "Simulate Live Stream"}
                   </button>
                   {(activeRing || selectedNode) && (
                     <button onClick={() => { setActiveRing(null); setSelectedNode(null); if (cyRef.current) { cyRef.current.elements().removeClass('hidden highlighted faded hidden-flow'); setSearchQuery(""); setMinRisk(0); } }} className="bg-slate-900 px-5 py-2 rounded-full text-xs font-bold border border-slate-700 flex items-center gap-2 text-white hover:bg-slate-800">
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
              <div className="w-full lg:w-[450px] rounded-[2.5rem] p-6 glass-panel border border-slate-700/50 h-auto lg:h-[750px] overflow-y-auto custom-scrollbar shadow-2xl">
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
                          <div key={i} onClick={() => handleRingClick(ring)} className="glass-card p-5 rounded-2xl cursor-pointer flex flex-col gap-3 relative overflow-hidden group border-l-4 border-l-red-500">
                            <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="flex justify-between items-center relative z-10">
                              <p className="font-black text-sm text-white font-heading">{ring.ring_id}</p>
                              <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-md text-[10px] font-black">{ring.score} PTS</span>
                            </div>
                            <p className="text-[11px] text-slate-400 uppercase font-bold relative z-10">{ring.pattern_type}</p>
                          </div>
                        ))}
                      </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FLOATING AI CHATBOT */}
      <div className="fixed bottom-6 lg:bottom-10 right-6 lg:right-10 z-50">
        {chatOpen ? (
          <div className="glass-panel border border-slate-700/50 w-[90vw] lg:w-96 h-[60vh] lg:h-[500px] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8">
            <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white border-b border-white/10">
              <span className="text-sm font-black uppercase flex items-center gap-2 font-heading tracking-widest"><Radio size={16} className="animate-pulse"/> Forensic AI</span>
              <button onClick={() => setChatOpen(false)} className="hover:rotate-90 transition-transform"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-medium custom-scrollbar bg-[#020617]/40">
              {messages.map((m, i) => (
                <div key={i} className={cn("p-3 rounded-2xl max-w-[85%] leading-relaxed", m.role === 'user' ? "bg-blue-600 text-white ml-auto" : "bg-slate-900 border border-slate-800 text-slate-300")}>{m.text}</div>
              ))}
            </div>
            <div className="p-4 glass-panel border-t border-slate-700/50 flex gap-3">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChat()} placeholder="Query forensic data..." className="flex-1 bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all placeholder:text-slate-500" />
              <button onClick={handleChat} className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white hover:scale-105 active:scale-95 transition-all shadow-lg"><Send size={16}/></button>
            </div>
          </div>
        ) : (
          <button onClick={() => setChatOpen(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 rounded-full shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-110 active:scale-95 transition-all text-white relative group">
            <Activity size={28} className="group-hover:animate-pulse" />
            <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 border-2 border-[#020617] rounded-full animate-ping"></div>
            <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 border-2 border-[#020617] rounded-full"></div>
          </button>
        )}
      </div>
    </div>
  );
}