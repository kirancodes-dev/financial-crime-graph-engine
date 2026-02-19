import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import CytoscapeComponent from 'react-cytoscapejs';
import { Upload, ShieldAlert, Activity, AlertTriangle, Network, Crosshair, X, Layers, RefreshCcw, Combine, ArrowUpRight, ArrowDownLeft, Database, ShieldBan, Users, Download, Maximize, Play, FileText, Globe, Radio, Filter, Route, Crown } from 'lucide-react';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function App() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeRing, setActiveRing] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // --- NEW: HOLOGRAPHIC TOOLTIP STATE ---
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; data: any } | null>(null);

  const [pathMode, setPathMode] = useState(false);
  const pathSelectionRef = useRef<string[]>([]);

  const [filters, setFilters] = useState({
    normal: true,
    cycles: true,
    smurfs: true,
    layered: true,
    offshore: true,
    shadow_boss: true
  });

  const cyRef = useRef<any>(null);
  const [procTime, setProcTime] = useState<number>(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    const startTime = performance.now();

    try {
      const response = await fetch("http://127.0.0.1:8000/api/analyze", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Backend connection failed");
      const data = await response.json();
      
      // --- NEW: INJECT VOLUME DATA FOR WHALE LENS SCALING ---
      data.graph_data.forEach((el: any) => {
        if (el.data.id && el.data.total_sent !== undefined) {
          el.data.total_volume = el.data.total_sent + el.data.total_received;
        }
        if (el.data.source && el.data.amount) {
          el.data.amount_num = parseFloat(el.data.amount); // Convert string to number for Cytoscape math
        }
      });

      setProcTime(Number(((performance.now() - startTime) / 1000).toFixed(2)));
      setResults(data);
    } catch (error) {
      console.error(error);
      alert("Backend Error: Ensure server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'], 'text/plain': ['.csv'] } 
  });

  useEffect(() => {
    let animationFrameId: number;
    let offset = 0;
    
    const animateEdges = () => {
      offset -= 0.5; 
      if (cyRef.current) {
        cyRef.current.edges('.highlighted, .path-edge, .contagion-path').style('line-dash-offset', offset);
      }
      animationFrameId = requestAnimationFrame(animateEdges);
    };
    
    animateEdges();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const generateSAR = () => { 
    if (!selectedNode) return;
    const reportDate = new Date().toISOString().split('T')[0];
    const reportText = `=======================================================\nFINCEN SUSPICIOUS ACTIVITY REPORT (SAR)\n=======================================================\nDATE: ${reportDate}\nENTITY ID: ${selectedNode.id}\nGEO: ${selectedNode.country}\nRISK SCORE: ${selectedNode.risk_score}\n\n>>> ACTION: ${selectedNode.recommend_freeze ? 'FREEZE' : 'MONITOR'} <<<\n\n1. PATTERNS:\n- Primary: ${selectedNode.fraud_type.replace('_', ' ')}\n- Rings: ${selectedNode.fraud_count}\n\n2. FINANCIALS:\nSent: $${selectedNode.total_sent?.toLocaleString()}\nReceived: $${selectedNode.total_received?.toLocaleString()}\n\n=======================================================`;
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAR_${selectedNode.id}_${reportDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => { 
    if (!results) return;
    const exportData = {
      suspicious_accounts: results.graph_data.filter((el: any) => el.data.id && el.data.is_suspicious).map((el: any) => ({
        account_id: el.data.id, country: el.data.country, suspicion_score: el.data.risk_score, detected_patterns: [el.data.fraud_type],
      })),
      fraud_rings: results.fraud_rings,
      summary: { total_accounts_analyzed: results.analytics.total_transactions, suspicious_accounts_flagged: results.analytics.flagged_entities, freeze_recommendations: results.analytics.freeze_recommendations, processing_time_seconds: procTime }
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `rift_audit_${new Date().getTime()}.json`;
    a.click();
  };

  const cyStylesheet = [
    {
      selector: 'node',
      style: {
        // --- WHALE LENS: DYNAMIC NODE SIZING based on total volume ---
        'width': 'mapData(total_volume, 0, 100000, 30, 95)',
        'height': 'mapData(total_volume, 0, 100000, 30, 95)',
        'background-color': '#0f172a', 'border-width': 2, 'border-color': '#3b82f6',
        'label': 'data(label)', 'color': '#f8fafc', 'font-size': '10px', 'font-weight': 'bold',
        'text-valign': 'bottom', 'text-margin-y': 8, 'text-background-color': '#020617', 'text-background-opacity': 0.85, 'text-background-padding': '4px',
        'transition-property': 'opacity, border-color, shadow-blur, width, height, background-color', 'transition-duration': 300,
        'text-wrap': 'wrap' 
      }
    },
    { selector: 'node[fraud_type *= "SMURF"]', style: { 'background-color': '#422006', 'border-color': '#eab308', 'color': '#fef08a' } },
    { selector: 'node[fraud_type = "LAYERED"]', style: { 'background-color': '#431407', 'border-color': '#f97316', 'color': '#fdba74' } },
    { selector: 'node[fraud_type = "CYCLE"]', style: { 'background-color': '#450a0a', 'border-color': '#ef4444', 'color': '#fca5a5' } },
    { selector: 'node[fraud_type = "OVERLAPPING_FRAUD"]', style: { 'background-color': '#3b0764', 'border-width': 4, 'border-color': '#a855f7', 'shape': 'hexagon' } },
    { selector: 'node[fraud_type = "OFFSHORE_ROUTING"]', style: { 'background-color': '#4a044e', 'border-color': '#ec4899', 'color': '#fbcfe8' } },
    { selector: 'node[fraud_type *= "SHADOW_BOSS"]', style: { 'background-color': '#f8fafc', 'border-width': 6, 'border-color': '#cbd5e1', 'shadow-blur': 25, 'shadow-color': '#ffffff', 'shadow-opacity': 1, 'color': '#ffffff', 'shape': 'diamond' } },
    
    {
      selector: 'edge',
      style: {
        // --- WHALE LENS: DYNAMIC EDGE SIZING based on transaction amount ---
        'width': 'mapData(amount_num, 0, 50000, 1.5, 10)',
        'line-color': '#334155', 'target-arrow-color': '#334155', 'target-arrow-shape': 'chevron',
        'curve-style': 'bezier', 'label': 'data(amount)', 'font-size': '9px', 'color': '#94a3b8',
        'text-rotation': 'autorotate', 'text-background-color': '#0f172a', 'text-background-opacity': 1,
        'transition-property': 'opacity, line-color', 'transition-duration': 300
      }
    },
    { selector: 'edge[?is_fraudulent]', style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', 'line-style': 'dashed' } },
    
    { selector: '.dimmed', style: { 'opacity': 0.10 } },
    { selector: '.hidden', style: { 'display': 'none' } },
    { selector: '.filtered-out', style: { 'display': 'none' } }, 
    
    { selector: 'node.highlighted', style: { 'border-width': 5, 'border-color': '#06b6d4', 'shadow-blur': 25, 'shadow-color': '#06b6d4', 'shadow-opacity': 1 } },
    { selector: 'edge.highlighted', style: { 'line-color': '#06b6d4', 'target-arrow-color': '#06b6d4', 'opacity': 1, 'line-style': 'dashed', 'line-dash-pattern': [8, 4] } },
    
    { selector: '.edge-hidden', style: { 'opacity': 0 } },
    { selector: '.node-flash', style: { 'border-color': '#fbbf24', 'border-width': 6, 'shadow-blur': 30, 'shadow-color': '#fbbf24', 'shadow-opacity': 1 } },

    { selector: 'node.contagion-source', style: { 'background-color': '#000000', 'border-color': '#ef4444', 'border-width': 6, 'shape': 'star' } },
    { selector: 'node.contagion-victim', style: { 'background-color': '#14532d', 'border-color': '#84cc16', 'shadow-blur': 20, 'shadow-color': '#84cc16', 'shadow-opacity': 1, 'color': '#bef264' } },
    { selector: 'edge.contagion-path', style: { 'line-color': '#84cc16', 'target-arrow-color': '#84cc16', 'opacity': 1, 'line-style': 'dashed', 'line-dash-pattern': [6, 6] } },

    { selector: 'node.path-node', style: { 'background-color': '#be185d', 'border-color': '#f472b6', 'border-width': 5, 'shadow-blur': 30, 'shadow-color': '#f472b6', 'shadow-opacity': 1 } },
    { selector: 'edge.path-edge', style: { 'line-color': '#f472b6', 'target-arrow-color': '#f472b6', 'opacity': 1, 'line-style': 'dashed', 'line-dash-pattern': [10, 5] } }
  ];

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    cy.batch(() => {
      cy.nodes().forEach((node: any) => {
        const type = node.data('fraud_type') || 'NORMAL';
        let isVisible = true;
        
        if (type === 'NORMAL' && !filters.normal) isVisible = false;
        if (type.includes('CYCLE') && !filters.cycles) isVisible = false;
        if (type.includes('SMURF') && !filters.smurfs) isVisible = false;
        if (type.includes('LAYERED') && !filters.layered) isVisible = false;
        if (type.includes('OFFSHORE') && !filters.offshore) isVisible = false;
        if (type.includes('SHADOW') && !filters.shadow_boss) isVisible = false;

        if (isVisible) {
          node.removeClass('filtered-out');
          node.connectedEdges().forEach((edge: any) => {
            if (!edge.source().hasClass('filtered-out') && !edge.target().hasClass('filtered-out')) {
              edge.removeClass('filtered-out');
            }
          });
        } else {
          node.addClass('filtered-out');
          node.connectedEdges().addClass('filtered-out');
        }
      });
    });
  }, [filters]);

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePathMode = () => {
    setPathMode(!pathMode);
    pathSelectionRef.current = [];
    resetGraph();
  };

  const simulateBlastRadius = () => {
    if (!selectedNode || !cyRef.current) return;
    const cy = cyRef.current;
    const rootNode = cy.getElementById(selectedNode.id);
    const successors = rootNode.successors(); 

    cy.elements().removeClass('highlighted dimmed hidden edge-hidden node-flash contagion-source contagion-victim contagion-path path-node path-edge');
    cy.elements().difference(successors.union(rootNode)).addClass('dimmed');
    
    rootNode.addClass('contagion-source');
    successors.nodes().addClass('contagion-victim');
    successors.edges().addClass('contagion-path');

    cy.animate({ fit: { eles: successors.union(rootNode), padding: 100 }, duration: 800, easing: 'ease-in-out-cubic' });
  };

  const playTimeLapse = () => {
    if (!cyRef.current || isPlaying) return;
    const cy = cyRef.current;
    setIsPlaying(true);
    resetGraph(); 
    
    const allEdges = cy.edges();
    allEdges.addClass('edge-hidden');

    const sortedEdges = allEdges.toArray().sort((a: any, b: any) => new Date(a.data('timestamp')).getTime() - new Date(b.data('timestamp')).getTime());

    let index = 0;
    const interval = setInterval(() => {
      if (index >= sortedEdges.length) {
        clearInterval(interval);
        setIsPlaying(false);
        allEdges.removeClass('edge-hidden'); 
        return;
      }
      
      const edge = sortedEdges[index];
      edge.removeClass('edge-hidden');
      
      const connectedNodes = edge.connectedNodes();
      connectedNodes.addClass('node-flash');
      setTimeout(() => { if (cyRef.current) connectedNodes.removeClass('node-flash'); }, 200);
      
      index++;
    }, 60); 
  };

  const resetGraph = () => {
    setActiveRing(null);
    setSelectedNode(null);
    setTooltip(null);
    if (cyRef.current) {
      cyRef.current.elements().removeStyle('display opacity'); 
      cyRef.current.elements().removeClass('highlighted dimmed hidden edge-hidden node-flash contagion-source contagion-victim contagion-path path-node path-edge');
      cyRef.current.layout({ name: 'cose', animate: true, animationDuration: 600 }).run();
    }
  };

  const setUpListeners = (cy: any) => {
    if (cyRef.current) return;
    cyRef.current = cy;
    
    // --- TOOLTIP HOVER LISTENERS ---
    cy.on('mouseover', 'node', (evt: any) => {
      const node = evt.target;
      setTooltip({
        show: true,
        x: evt.originalEvent.clientX,
        y: evt.originalEvent.clientY,
        data: node.data()
      });
      document.body.style.cursor = 'pointer';
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(null);
      document.body.style.cursor = 'default';
    });

    cy.on('tap', 'node', (evt: any) => {
      setTooltip(null); // Hide tooltip on click
      const targetNode = evt.target;
      
      if (document.getElementById('path-finder-active')) {
        const nodeId = targetNode.id();
        
        if (pathSelectionRef.current.length === 0) {
          pathSelectionRef.current = [nodeId];
          targetNode.addClass('path-node'); 
        } else if (pathSelectionRef.current.length === 1) {
          pathSelectionRef.current.push(nodeId);
          targetNode.addClass('path-node'); 
          
          const sourceId = pathSelectionRef.current[0];
          const targetId = pathSelectionRef.current[1];
          
          const aStar = cy.elements().aStar({ root: cy.getElementById(sourceId), goal: cy.getElementById(targetId), directed: true });
          
          if (aStar.found) {
            cy.elements().removeClass('path-node path-edge dimmed highlighted');
            cy.elements().difference(aStar.path).addClass('dimmed');
            aStar.path.addClass('path-node');
            aStar.path.edges().addClass('path-edge');
            
            cy.animate({ fit: { eles: aStar.path, padding: 100 }, duration: 800, easing: 'ease-in-out-cubic' });
          } else {
            alert("No direct financial trail found between these two accounts.");
            cy.elements().removeClass('path-node');
          }
          pathSelectionRef.current = []; 
        }
        return; 
      }

      setSelectedNode(targetNode.data());
      const isFocusMode = cy.elements('.hidden').length > 0 || cy.elements('.contagion-source').length > 0;
      if (!isFocusMode) {
        setActiveRing(null);
        const directEdges = targetNode.connectedEdges();
        const neighborhood = targetNode.union(directEdges.connectedNodes()).union(directEdges);
        
        cy.elements().removeClass('highlighted dimmed hidden edge-hidden node-flash contagion-source contagion-victim contagion-path path-node path-edge');
        cy.elements().difference(neighborhood).addClass('dimmed');
        neighborhood.addClass('highlighted');

        cy.animate({ fit: { eles: neighborhood, padding: 120 }, duration: 700, easing: 'ease-in-out-cubic' });
      }
    });
    
    cy.on('tap', (evt: any) => { 
      if (evt.target === cy) resetGraph(); 
    });
  };

  const handleRingClick = (ring: any) => {
    setSelectedNode(null); 
    setActiveRing(ring.ring_id);
    setIsPlaying(false); 

    if (cyRef.current) {
      const cy = cyRef.current;
      const targetNodes = cy.nodes().filter((n: any) => ring.nodes.includes(n.id()));
      const targetEdges = targetNodes.edgesWith(targetNodes);
      const targetCycle = targetNodes.union(targetEdges);

      cy.elements().removeClass('highlighted dimmed hidden edge-hidden node-flash contagion-source contagion-victim contagion-path path-node path-edge');
      cy.elements().difference(targetCycle).addClass('hidden');
      targetCycle.addClass('highlighted');

      let layoutName = 'cose'; 
      if (ring.pattern_type.includes('Cyclic')) layoutName = 'circle';
      else if (ring.pattern_type.includes('Layered') || ring.pattern_type.includes('Shell')) layoutName = 'breadthfirst';
      else if (ring.pattern_type.includes('Smurfing') || ring.pattern_type.includes('Aggregation')) layoutName = 'concentric';

      targetCycle.layout({
        name: layoutName,
        fit: true,
        padding: 150,
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-in-out-cubic'
      }).run();
    }
  };

  const getFraudIcon = (type: string) => {
    if (type.includes('Cyclic')) return <RefreshCcw size={14} className="text-red-500" />;
    if (type.includes('Layered')) return <Layers size={14} className="text-orange-500" />;
    if (type.includes('Smurfing') || type.includes('Aggregation')) return <Combine size={14} className="text-yellow-500" />;
    if (type.includes('OFFSHORE')) return <Globe size={14} className="text-pink-500" />;
    if (type.includes('SHADOW')) return <Crown size={14} className="text-white" />;
    return <AlertTriangle size={14} className="text-slate-500" />;
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-6 font-sans relative">
      {pathMode && <div id="path-finder-active" className="hidden"></div>}
      
      {/* FLOATING HOLOGRAPHIC TOOLTIP */}
      {tooltip?.show && tooltip.data && (
        <div 
          className="fixed z-50 pointer-events-none bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl p-3 rounded-lg flex flex-col gap-1 transition-opacity duration-150 animate-in fade-in"
          style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
        >
          <div className="flex items-center gap-2 mb-1 border-b border-slate-800 pb-1">
            <span className="text-[10px] font-black uppercase text-blue-400">ID: {tooltip.data.id}</span>
            <span className="text-[9px] bg-slate-800 px-1.5 rounded text-slate-300">GEO: {tooltip.data.country}</span>
          </div>
          <p className="text-[10px] text-slate-400"><span className="text-slate-500">Threat:</span> <span className="font-bold text-slate-200">{tooltip.data.fraud_type}</span></p>
          <p className="text-[10px] text-slate-400"><span className="text-slate-500">Volume:</span> <span className="font-bold text-green-400">${tooltip.data.total_volume?.toLocaleString() || 0}</span></p>
          <p className="text-[10px] text-slate-400"><span className="text-slate-500">Score:</span> <span className="font-bold text-amber-500">{tooltip.data.risk_score} PTS</span></p>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-4">
        
        <header className="border-b border-slate-800 pb-4 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg border bg-blue-950/50 border-blue-900/50">
                <ShieldAlert className="text-blue-500 w-8 h-8" />
              </div>
              <h1 className="text-4xl font-black text-white tracking-tight">RIFT <span className="text-blue-500 font-light">FORENSICS</span></h1>
            </div>
            <p className="text-slate-500 text-xs font-bold tracking-[0.2em] uppercase pl-14">Analytics, Triage & Compliance Layer</p>
          </div>
          {results && (
            <button onClick={downloadJSON} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-lg">
              <Download size={16} className="mr-2 text-blue-400" /> Export JSON
            </button>
          )}
        </header>

        {!results && (
          <div {...getRootProps()} className={cn("border-2 border-dashed rounded-2xl p-32 text-center cursor-pointer transition-all duration-300 mt-10", isDragActive ? "border-blue-500 bg-blue-950/20" : "border-slate-800 bg-[#0a0f1c] hover:border-slate-600 shadow-xl")}>
            <input {...getInputProps()} />
            {loading ? <Activity className="w-16 h-16 text-blue-500 animate-pulse mx-auto mb-6" /> : <Database className="w-16 h-16 text-slate-600 mx-auto mb-6" />}
            <h2 className="text-3xl font-bold text-slate-200 mb-2">Initialize Heuristic Engine</h2>
            <p className="text-slate-500 font-medium">Upload datasets to compute risk, detect global patterns, and map money trails.</p>
          </div>
        )}

        {results && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#0a0f1c] border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                <div className="p-3 bg-blue-950/50 text-blue-500 rounded-lg"><Database size={20} /></div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Transactions</p>
                  <p className="text-2xl font-black text-slate-200">{results.analytics.total_transactions.toLocaleString()}</p>
                </div>
              </div>
              <div className="bg-[#0a0f1c] border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                <div className="p-3 bg-amber-950/30 text-amber-500 rounded-lg"><Users size={20} /></div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Flagged Entities</p>
                  <p className="text-2xl font-black text-amber-400">{results.analytics.flagged_entities}</p>
                </div>
              </div>
              <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex items-center gap-4">
                <div className="p-3 bg-red-950/50 text-red-500 rounded-lg animate-pulse"><ShieldBan size={20} /></div>
                <div>
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Recommended Freezes</p>
                  <p className="text-2xl font-black text-red-500">{results.analytics.freeze_recommendations}</p>
                </div>
              </div>
              <div className="bg-[#0a0f1c] border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                <div className="p-3 bg-slate-900 text-slate-400 rounded-lg"><Activity size={20} /></div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Max Account Score</p>
                  <p className="text-2xl font-black text-slate-200">{results.analytics.max_risk_score} PTS</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0a0f1c] border border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-4 overflow-x-auto">
                <div className="flex items-center gap-2 text-slate-500 border-r border-slate-800 pr-4">
                  <Filter size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Network Filters</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleFilter('normal')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border", filters.normal ? "bg-slate-800 text-white border-slate-600" : "bg-transparent text-slate-600 border-slate-800")}>Normal Traffic</button>
                  <button onClick={() => toggleFilter('cycles')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border flex items-center gap-1", filters.cycles ? "bg-red-950/50 text-red-400 border-red-900/50" : "bg-transparent text-slate-600 border-slate-800")}><RefreshCcw size={12}/> Cycles</button>
                  <button onClick={() => toggleFilter('smurfs')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border flex items-center gap-1", filters.smurfs ? "bg-yellow-950/50 text-yellow-500 border-yellow-900/50" : "bg-transparent text-slate-600 border-slate-800")}><Combine size={12}/> Smurfing</button>
                  <button onClick={() => toggleFilter('layered')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border flex items-center gap-1", filters.layered ? "bg-orange-950/50 text-orange-400 border-orange-900/50" : "bg-transparent text-slate-600 border-slate-800")}><Layers size={12}/> Shells</button>
                  <button onClick={() => toggleFilter('offshore')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border flex items-center gap-1", filters.offshore ? "bg-pink-950/50 text-pink-400 border-pink-900/50" : "bg-transparent text-slate-600 border-slate-800")}><Globe size={12}/> Offshore</button>
                  <button onClick={() => toggleFilter('shadow_boss')} className={cn("px-3 py-1.5 rounded text-xs font-bold transition-colors border flex items-center gap-1", filters.shadow_boss ? "bg-slate-100 text-slate-900 border-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "bg-transparent text-slate-600 border-slate-800")}><Crown size={12}/> Shadow Bosses</button>
                </div>
              </div>
              
              <button 
                onClick={togglePathMode}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-2", pathMode ? "bg-pink-600 border-pink-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)] animate-pulse" : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800")}
              >
                <Route size={14} /> {pathMode ? "SELECT TWO ACCOUNTS TO TRACE..." : "Money Trail Path-Finder"}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 bg-[#0a0f1c] border border-slate-800 rounded-2xl relative overflow-hidden h-[700px] shadow-2xl cursor-crosshair">
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.4 }}></div>
                
                <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-lg">
                    <Network size={16} className="text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Topology Viewer {activeRing ? '(Target Isolated)' : pathMode ? '(A* Trace Mode)' : '(Auto-Pruned)'}</span>
                  </div>
                </div>

                <div className="absolute top-4 right-4 z-20 flex gap-2">
                  {!activeRing && !pathMode && (
                    <button 
                      onClick={playTimeLapse}
                      disabled={isPlaying}
                      className="bg-indigo-900/80 backdrop-blur border border-indigo-500 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 transition-all hover:bg-indigo-800 disabled:opacity-50"
                    >
                      <Play size={14} className={isPlaying ? "animate-pulse text-indigo-300" : "text-indigo-400"} /> 
                      {isPlaying ? "Simulating Activity..." : "▶ Time-Lapse"}
                    </button>
                  )}
                  {(activeRing || cyRef.current?.elements('.path-edge').length > 0) && (
                    <button 
                      onClick={resetGraph}
                      className="bg-slate-900/90 backdrop-blur border border-slate-700 hover:border-cyan-500 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 transition-all"
                    >
                      <Maximize size={14} className="text-cyan-400" /> Reset View
                    </button>
                  )}
                </div>

                <CytoscapeComponent elements={results.graph_data} stylesheet={cyStylesheet} layout={{ name: 'cose', nodeRepulsion: 400000, idealEdgeLength: 120 }} cy={(cy) => setUpListeners(cy)} style={{ width: '100%', height: '100%' }} />
              </div>

              <div className="bg-[#0a0f1c] border border-slate-800 rounded-2xl overflow-hidden h-[700px] shadow-2xl flex flex-col relative">
                {selectedNode ? (
                  <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                    <div className="p-5 border-b border-slate-800 bg-slate-900/50">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                          <Crosshair size={16} /> Interrogation
                        </h2>
                        <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
                      </div>

                      <button 
                        onClick={simulateBlastRadius}
                        className="w-full mb-4 bg-green-950/30 border border-green-700 text-green-400 hover:bg-green-900/50 hover:text-green-300 p-2.5 rounded-lg flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-green-900/20"
                      >
                        <Radio size={16} /> Simulate Freeze Contagion
                      </button>
                      
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[10px] text-slate-500 font-mono uppercase mb-1">Entity ID & Geo</p>
                          <p className={cn("text-xl font-mono font-bold break-all", selectedNode.is_suspicious ? "text-red-400" : "text-slate-200")}>{selectedNode.id}</p>
                          <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-1"><Globe size={12}/> Jurisdiction: {selectedNode.country}</p>
                        </div>
                        <button onClick={generateSAR} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded shadow-lg transition-colors" title="Generate SAR Document">
                          <FileText size={18} />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-[#020617] p-2 rounded border border-slate-800">
                          <p className="text-[9px] text-slate-500 uppercase">Total Sent</p>
                          <p className="text-xs font-bold text-slate-300">${selectedNode.total_sent?.toLocaleString() || 0}</p>
                        </div>
                        <div className="bg-[#020617] p-2 rounded border border-slate-800">
                          <p className="text-[9px] text-slate-500 uppercase">Total Received</p>
                          <p className="text-xs font-bold text-slate-300">${selectedNode.total_received?.toLocaleString() || 0}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 rounded-sm text-[9px] font-black uppercase bg-slate-950 border border-slate-700 text-amber-500">
                          {selectedNode.risk_score} PTS
                        </span>
                        {selectedNode.is_suspicious && (
                          <span className="px-2 py-1 rounded-sm text-[9px] font-black uppercase bg-red-950/30 border border-red-900/50 text-red-400">
                            Detected in {selectedNode.fraud_count} Rings
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 flex-1 overflow-y-auto">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">Ledger History</h3>
                      <div className="space-y-2">
                        {selectedNode.history?.length > 0 ? (
                          selectedNode.history.map((tx: any, idx: number) => (
                            <div key={idx} className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50 text-xs">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className={cn("flex items-center gap-1 font-bold", tx.type === 'SENT' ? "text-orange-400" : "text-green-400")}>
                                  {tx.type === 'SENT' ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />} {tx.type}
                                </span>
                                <span className="font-mono font-bold text-slate-300">${tx.amount.toLocaleString()}</span>
                              </div>
                              <p className="text-slate-500 font-mono text-[10px] truncate">
                                {tx.type === 'SENT' ? 'To: ' : 'From: '} <span className="text-slate-400">{tx.counterparty}</span>
                              </p>
                              <p className="text-slate-600 font-mono text-[9px] mt-1">{tx.time.replace('T', ' ')}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-4">No recent history available</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex flex-col h-full animate-in fade-in duration-300">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 pb-4 border-b border-slate-800">
                      <AlertTriangle size={16} className="text-red-500" /> Triage Leaderboard
                    </h2>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      {results.fraud_rings.map((ring: any, i: number) => (
                        <div 
                          key={i} 
                          onClick={() => handleRingClick(ring)}
                          className={cn("p-4 rounded-xl border shadow-lg relative overflow-hidden transition-all cursor-pointer hover:scale-[1.02]", 
                            activeRing === ring.ring_id ? "bg-cyan-950/30 border-cyan-500 shadow-cyan-900/50" : 
                            ring.is_highest_risk ? "bg-[#1a1005] border-amber-500/50 border-l-4 border-l-amber-500 hover:bg-[#251708]" : 
                            "bg-[#0f172a] border-slate-800 border-l-4 border-l-blue-500 hover:bg-slate-900")}
                        >
                          <div className={cn("absolute top-0 right-0 text-[10px] font-black uppercase px-2 py-1 rounded-bl-lg", 
                            activeRing === ring.ring_id ? "bg-cyan-500 text-slate-900" :
                            ring.is_highest_risk ? "bg-amber-500/20 text-amber-500" : "bg-slate-800 text-slate-400")}>
                            {activeRing === ring.ring_id ? "ACTIVE TARGET" : ring.is_highest_risk ? "MAX PRIORITY" : `Rank #${i+1}`}
                          </div>
                          <p className={cn("font-bold text-sm mb-1 flex items-center gap-2", 
                            activeRing === ring.ring_id ? "text-cyan-400" :
                            ring.is_highest_risk ? "text-amber-400" : "text-slate-200")}>
                            {getFraudIcon(ring.pattern_type)} {ring.ring_id}
                          </p>
                          <p className="text-xs text-slate-400 mb-3">{ring.pattern_type}</p>
                          <div className="bg-slate-950 inline-block px-2 py-1 rounded border border-slate-800 text-[11px] font-mono">
                            Severity: <span className={ring.is_highest_risk ? "text-amber-500 font-bold" : "text-red-400 font-bold"}>{ring.score} PTS</span>
                          </div>
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
    </div>
  );
}