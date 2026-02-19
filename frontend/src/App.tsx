import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import CytoscapeComponent from 'react-cytoscapejs';
import { Download, Upload, ShieldAlert, Activity, Bot, ChevronRight } from 'lucide-react';

// Provide a minimal JSX IntrinsicElements declaration to satisfy the compiler
// when the react/jsx-runtime declaration files are not available.
declare global {
  namespace JSX {
    interface IntrinsicElements { [key: string]: any; }
  }
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Send the file to your Python backend
      const response = await fetch("http://127.0.0.1:8000/api/analyze", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) throw new Error("Backend connection failed");
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error(error);
      alert("Failed to connect to the backend. Ensure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'text/csv': ['.csv'] } 
  });

  const downloadJSON = () => {
    if (!results) return;
    const exportData = {
      suspicious_accounts: results.suspicious_accounts,
      fraud_rings: results.fraud_rings,
      summary: results.summary
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "rift_ai_audit_report.json";
    a.click();
  };

  // Cytoscape Graph Styling
  const cyStylesheet = [
    { 
      selector: 'node', 
      style: { 
        'background-color': '#1e293b', 
        'label': 'data(label)', 
        'color': '#94a3b8', 
        'font-size': '10px',
        'text-valign': 'bottom',
        'text-margin-y': 4
      } 
    },
    { 
      selector: 'node[?is_suspicious]', 
      style: { 
        'background-color': '#ff003c', 
        'shape': 'hexagon', 
        'border-width': 3, 
        'border-color': '#ff003c',
        'width': 45,
        'height': 45,
        'color': '#ff003c',
        'font-weight': 'bold'
      } 
    },
    { 
      selector: 'edge', 
      style: { 
        'width': 1.5, 
        'line-color': '#334155', 
        'target-arrow-shape': 'triangle', 
        'curve-style': 'bezier',
        'target-arrow-color': '#334155'
      } 
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="border-b border-slate-800 pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <ShieldAlert className="text-red-500" /> RIFT <span className="text-blue-500">FORENSICS</span>
            </h1>
            <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mt-1">Autonomous Money Muling Detection</p>
          </div>
          {results && (
            <button 
              onClick={downloadJSON} 
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold text-sm shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
            >
              <Download size={16} /> Download JSON Report
            </button>
          )}
        </header>

        {/* Upload Zone */}
        {!results && (
          <div 
            {...getRootProps()} 
            className={`border-2 border-dashed rounded-xl p-24 text-center cursor-pointer transition-all duration-300 ${
              isDragActive ? 'border-blue-500 bg-blue-900/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <div className="flex flex-col items-center space-y-4">
                <Activity className="w-12 h-12 text-blue-500 animate-pulse" />
                <p className="text-blue-400 font-mono tracking-widest animate-pulse">AI ANALYZING TRANSACTION LEDGER...</p>
              </div>
            ) : (
              <div>
                <Upload className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-2xl font-bold text-slate-300">Upload Transaction CSV</p>
                <p className="text-slate-500 mt-2">Drag and drop your ledger to map illicit networks</p>
              </div>
            )}
          </div>
        )}

        {/* Results Dashboard */}
        {results && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <p className="text-xs text-slate-500 uppercase font-bold">Accounts Analyzed</p>
                <p className="text-2xl font-mono text-white mt-1">{results.summary.total_accounts_analyzed}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <p className="text-xs text-red-500 uppercase font-bold">Suspicious Flagged</p>
                <p className="text-2xl font-mono text-red-500 mt-1">{results.summary.suspicious_accounts_flagged}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <p className="text-xs text-orange-500 uppercase font-bold">Rings Detected</p>
                <p className="text-2xl font-mono text-orange-500 mt-1">{results.summary.fraud_rings_detected}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <p className="text-xs text-green-500 uppercase font-bold">Compute Time</p>
                <p className="text-2xl font-mono text-green-500 mt-1">{results.summary.processing_time_seconds}s</p>
              </div>
            </div>

            {/* Split Layout: Graph on left, AI/Data on right */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Left Column: Graph Visualization */}
              <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl h-[700px] overflow-hidden p-2 shadow-xl flex flex-col">
                <div className="p-2 flex justify-between items-center opacity-70">
                  <span className="text-xs font-mono uppercase tracking-widest text-slate-400">Network Topology Map</span>
                </div>
                <div className="flex-grow">
                  <CytoscapeComponent 
                    elements={results.graph_data} 
                    stylesheet={cyStylesheet} 
                    layout={{ name: 'cose', animate: true, padding: 30 }} 
                    style={{ width: '100%', height: '100%' }} 
                  />
                </div>
              </div>

              {/* Right Column: AI Assistant & Threat Feed */}
              <div className="flex flex-col space-y-6 h-[700px]">
                
                {/* AI Investigation Assistant Panel */}
                <div className="bg-slate-900 border border-blue-900/50 rounded-xl overflow-hidden shadow-2xl shadow-blue-900/10 flex-shrink-0">
                  <div className="p-4 bg-gradient-to-r from-blue-950 to-slate-900 border-b border-blue-900/50 flex items-center gap-3">
                    <Bot className="text-blue-400 w-5 h-5 animate-pulse" />
                    <h2 className="text-sm font-bold text-blue-100 uppercase tracking-widest">AI Investigator Copilot</h2>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-slate-300 leading-relaxed font-mono">
                      {results.summary.ai_global_insight || "System operating normally."}
                    </p>
                  </div>
                </div>

                {/* Threat Feed with Fraud Stage Badges */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col flex-grow shadow-xl">
                  <div className="p-4 bg-slate-800/50 border-b border-slate-800">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Classified Threat Feed</h2>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-4">
                    {results.fraud_rings.map((ring: any, i: number) => (
                      <div key={i} className="bg-slate-950 p-4 rounded-lg border-l-4 border-red-500 shadow-sm relative group mt-3">
                        
                        {/* Fraud Stage Badge (Placement, Layering, Integration) */}
                        <div className="absolute -top-3 right-3 bg-red-950 border border-red-500/50 text-red-400 text-[9px] px-2 py-1 rounded-full font-bold tracking-widest uppercase shadow-lg shadow-red-900/20">
                          STAGE: {ring.aml_stage || "DETECTED"}
                        </div>

                        <div className="flex justify-between items-start mb-2 mt-1">
                          <span className="text-red-400 font-mono font-bold text-sm">{ring.ring_id}</span>
                          <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-300 uppercase">{ring.pattern_type}</span>
                        </div>
                        
                        <p className="text-xs text-slate-400 mb-3">Risk Score: <span className="text-yellow-500 font-bold">{ring.risk_score}</span></p>
                        
                        {/* AI Per-Ring Insight */}
                        <div className="bg-blue-950/30 border border-blue-900/30 p-3 rounded mb-3 flex items-start gap-2">
                          <ChevronRight className="text-blue-500 w-4 h-4 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-blue-200 font-mono leading-relaxed">
                            {ring.ai_insight || "Awaiting AI analysis..."}
                          </p>
                        </div>

                        <div className="bg-slate-900 p-2 rounded text-[10px] text-slate-500 font-mono break-words leading-relaxed border border-slate-800">
                          {ring.member_accounts.join(' → ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}