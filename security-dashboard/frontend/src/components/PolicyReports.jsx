import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Shield, FileJson, AlertTriangle, CheckCircle, XCircle, Info, Hash, Clock, Download, ChevronRight, ChevronDown, Package, Layers, Image as ImageIcon, Globe, ClipboardList, Server } from 'lucide-react';

export default function PolicyReports() {
  const [activeView, setActiveView] = useState('kyverno'); // kyverno | sbom | image | nmap | cis | cluster
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data States
  const [kyvernoData, setKyvernoData] = useState({ rows: [], counts: {} });
  const [sbomData, setSbomData] = useState({ list: [], counts: {} });
  const [nmapData, setNmapData] = useState([]);
  const [cisData, setCisData] = useState({ list: [], counts: {} });
  const [clusterData, setClusterData] = useState({ list: [], counts: {} });

  // Image Report State
  const [imageFiles, setImageFiles] = useState([]);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imageData, setImageData] = useState({ list: [], counts: {} });

  // Filters
  const [kyvernoNs, setKyvernoNs] = useState('');
  const [kyvernoStatusFilters, setKyvernoStatusFilters] = useState({
    PASS: true, FAIL: true, WARN: true, ERROR: true, SKIP: true
  });
  const [sbomSeverityFilters, setSbomSeverityFilters] = useState({
    CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true
  });
  const [cisStatusFilters, setCisStatusFilters] = useState({
    PASS: true, FAIL: true, WARN: true, INFO: true
  });
  const [clusterSeverityFilters, setClusterSeverityFilters] = useState({
    CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true
  });

  // Image Filters
  const [imageNs, setImageNs] = useState('');
  const [imageSeverityFilters, setImageSeverityFilters] = useState({
    CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true
  });

  // Fetch logic
  useEffect(() => {
    setError(null);
    if (activeView === 'kyverno') {
      loadKyverno();
    } else if (activeView === 'sbom') {
      loadSbom();
    } else if (activeView === 'nmap') {
      loadNmap();
    } else if (activeView === 'image') {
      fetchImageFiles();
    } else if (activeView === 'cis') {
      loadCis();
    } else if (activeView === 'cluster') {
      loadCluster();
    }
  }, [activeView]);

  // Load Image Data when file selected
  useEffect(() => {
    if (activeView === 'image' && selectedImageFile) {
      loadImageReport(selectedImageFile);
    }
  }, [selectedImageFile]);


  const loadKyverno = async () => {
    if (kyvernoData.rows.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/kyverno-report/kyverno.zip');
      if (res.status === 404) {
        // Graceful handling for missing report
        setKyvernoData({ rows: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Kyverno report: ${res.status}`);
      const blob = await res.blob();

      const zip = await JSZip.loadAsync(blob);
      let file = zip.file(/kyverno\.json$/i)[0];
      if (!file) {
        const jsonFiles = zip.filter((relPath) => /\.json$/i.test(relPath));
        file = jsonFiles[0];
      }
      if (!file) throw new Error('No JSON file found in Kyverno ZIP');

      const text = await file.async('string');
      const rows = parseKyverno(JSON.parse(text));

      const counts = { FAIL: 0, WARN: 0, ERROR: 0, SKIP: 0, PASS: 0 };
      rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

      setKyvernoData({ rows, counts });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSbom = async () => {
    if (sbomData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/trivy-sbom/sbom.json');
      if (res.status === 404) {
        setSbomData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load SBOM report: ${res.status}`);
      const json = await res.json();
      const parsed = parseSbom(json);
      setSbomData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadNmap = async () => {
    if (nmapData.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/nmap/nmap.json');
      if (res.status === 404) {
        setNmapData([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Nmap report: ${res.status}`);
      const json = await res.json();
      const rows = parseSSL(json); // Reuse SSL parser logic for Nmap report as per requirement
      setNmapData(rows);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCis = async () => {
    if (cisData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/kube-bench/kubebench.txt');
      if (res.status === 404) {
        setCisData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load CIS report: ${res.status}`);
      const text = await res.text();
      const parsed = parseCisText(text);
      setCisData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCluster = async () => {
    if (clusterData.list.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/new/trivy-cluster-report/cluster.zip');
      if (res.status === 404) {
        setClusterData({ list: [], counts: {} });
        return;
      }
      if (!res.ok) throw new Error(`Failed to load Cluster report: ${res.status}`);
      const blob = await res.blob();
      const zip = await JSZip.loadAsync(blob);
      let file = zip.file(/cluster\.json$/i)[0];
      if (!file) {
        const jsonFiles = zip.filter((relPath) => /\.json$/i.test(relPath));
        file = jsonFiles[0];
      }
      if (!file) throw new Error('No JSON file found in Cluster ZIP');

      const text = await file.async('string');
      const parsed = parseCluster(JSON.parse(text));
      setClusterData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchImageFiles = async () => {
    if (imageFiles.length > 0) return;
    setLoading(true);
    try {
      // New backend endpoint to list files in trivy-reports
      const res = await fetch('/api/files/list?subpath=trivy-reports');
      if (!res.ok) throw new Error(`Failed to list image reports: ${res.status}`);
      const files = await res.json();
      setImageFiles(files);
      // Do not auto-select file, let user choose namespace checks first
      // if (files.length > 0) setSelectedImageFile(files[0]);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadImageReport = async (filename) => {
    setLoading(true);
    try {
      const res = await fetch(`/new/trivy-reports/${filename}`);
      if (!res.ok) throw new Error(`Failed to load report ${filename}: ${res.status}`);
      const json = await res.json();
      const parsed = parseImage(json);
      setImageData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  // --- Parsers ---

  function parseKyverno(json) {
    const items = Array.isArray(json?.items) ? json.items : [json];
    const rows = [];
    items.forEach(item => {
      if (!item || !item.results) return;
      const metaNs = (item.metadata && item.metadata.namespace) || '';
      const scope = item.scope || {};
      const scopeNs = scope.namespace || metaNs;
      const scopeKind = scope.kind || '';
      const scopeName = scope.name || '';
      item.results.forEach(res => {
        const status = String(res.result || '').toUpperCase();
        const sev = String(res.severity || 'UNKNOWN').toUpperCase();
        const base = { status, severity: sev, policy: res.policy || '', message: res.message || '', type: scopeKind, name: scopeName, namespace: scopeNs };
        const rlist = Array.isArray(res.resources) ? res.resources : [];
        if (rlist.length > 0) {
          rlist.forEach(r => {
            rows.push({
              ...base,
              type: String(r.kind || scopeKind || ''),
              name: String(r.name || scopeName || ''),
              namespace: String(r.namespace || scopeNs || '')
            });
          });
        } else {
          rows.push(base);
        }
      });
    });
    return rows;
  }

  function parseSbom(json) {
    const rows = [];
    if (!json || !Array.isArray(json.Results)) return { list: rows, counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 } };
    for (const res of json.Results) {
      const vulns = res.Vulnerabilities || [];
      const pkgsById = new Map();
      const pkgs = res.Packages || [];
      for (const p of pkgs) { const id = p.ID || p.Identifier?.BOMRef || p.Identifier?.PURL || p.Name; pkgsById.set(id, p); }
      for (const v of vulns) {
        const pkgId = String(v.PkgID || v.PkgName || '');
        const pkgName = String(v.PkgName || pkgsById.get(pkgId)?.Name || pkgId);
        rows.push({
          id: String(v.VulnerabilityID || ''),
          library: pkgName,
          installed: String(v.InstalledVersion || pkgsById.get(pkgId)?.Version || ''),
          fixed: String(v.FixedVersion || ''),
          status: String(v.Status || ''),
          severity: String(v.Severity || '').toUpperCase(),
          title: String(v.Title || ''),
          ref: Array.isArray(v.References) && v.References.length ? v.References[0] : (v.PrimaryURL || '')
        });
      }
    }
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const r of rows) { const s = (r.severity || 'UNKNOWN').toUpperCase(); counts[s] = (counts[s] || 0) + 1; }
    return { list: rows, counts };
  }

  function parseSSL(data) {
    const rows = [];
    if (!data) return rows;
    const arr = Array.isArray(data) ? data : [];
    for (const item of arr) {
      rows.push({
        namespace: String(item.namespace || ''),
        fqdn: String(item.fqdn || ''),
        port: item.port != null ? item.port : '',
        accepted: Array.isArray(item.accepted_ciphers) ? item.accepted_ciphers : [],
        weak: Array.isArray(item.weak_ciphers) ? item.weak_ciphers : [],
        safe: Array.isArray(item.safe_ciphers) ? item.safe_ciphers : []
      });
    }
    return rows;
  }

  function parseImage(json) {
    if (!json) return { list: [], counts: {} };
    const results = json.Results || json.results || [];
    const list = [];
    results.forEach(r => {
      const vuls = r.Vulnerabilities || r.vulnerabilities || [];
      vuls.forEach(v => {
        list.push({
          severity: (v.Severity || v.severity || "UNKNOWN").toUpperCase(),
          id: v.VulnerabilityID || v.vulnerabilityID || v.CVE || "",
          pkg: v.PkgName || v.pkgName || "",
          installed: v.InstalledVersion || v.installedVersion || "",
          fixed: v.FixedVersion || v.fixedVersion || "",
          title: v.Title || v.title || "",
          target: r.Target || r.target || json.ArtifactName || json.artifactName || "",
          refs: v.References || v.references || []
        });
      });
    });
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }

  function parseCisText(text) {
    if (!text) return { list: [], counts: {} };
    const lines = String(text).split(/\r?\n/);

    // Build section map from INFO headers (e.g., "1.2 API Server")
    const sectionMap = {};
    for (const line of lines) {
      const sm = line.match(/^\[INFO\]\s+([0-9]+(?:\.[0-9]+)?)\s+(.*)$/);
      if (sm) { sectionMap[sm[1]] = sm[2].trim(); }
    }
    const findSectionName = (id) => {
      let bestPrefix = '';
      let name = '';
      for (const prefix in sectionMap) {
        if (id === prefix || id.startsWith(prefix + '.')) {
          if (prefix.length > bestPrefix.length) { bestPrefix = prefix; name = sectionMap[prefix]; }
        }
      }
      if (name) return name;
      const major = id.split('.')[0];
      const majorMap = { '1': 'Control Plane', '2': 'Etcd', '3': 'Control Plane Config', '4': 'Worker Node', '5': 'Policies' };
      return majorMap[major] || `Group ${major}`;
    };

    // Build remediation map from "== Remediations ... ==" blocks
    const remMap = {};
    let inRem = false; let currentId = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^==\s*Remediations/.test(line)) { inRem = true; currentId = null; continue; }
      if (inRem && (/^==\s*Summary/.test(line) || /^\[INFO\]/.test(line) || /^\[(FAIL|WARN|PASS|INFO)\]/.test(line))) { inRem = false; currentId = null; continue; }
      if (!inRem) continue;

      const idm = line.match(/^([0-9]+(?:\.[0-9]+)+)\b(.*)$/);
      if (idm) {
        currentId = idm[1];
        const first = idm[2].trim();
        remMap[currentId] = first ? first : '';
        continue;
      }
      if (currentId) {
        if (/^==/.test(line)) { inRem = false; currentId = null; continue; }
        const t = line.trim();
        remMap[currentId] += (remMap[currentId] ? '\n' : '') + t;
      }
    }

    // Parse checks and attach section + remediation
    const list = [];
    const counts = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 };

    for (const line of lines) {
      const m = line.match(/^\[(FAIL|WARN|PASS|INFO)\]\s+([0-9]+(?:\.[0-9]+)+)\s+(.*)$/);
      if (m) {
        const status = m[1];
        const id = m[2];
        let title = m[3].trim();
        const typeMatch = title.match(/\((Manual|Automated)\)\s*$/);
        if (typeMatch) { title = title.replace(/\s*\((Manual|Automated)\)\s*$/, ''); }
        const section = findSectionName(id);
        const remediation = remMap[id] || '';

        list.push({ status, id, desc: title, section, remediation });
        counts[status] = (counts[status] || 0) + 1;
      }
    }

    return { list, counts };
  }

  function parseCluster(json) {
    if (!json) return { list: [], counts: {} };
    let results = [];
    // Support top-level Results/results
    if (Array.isArray(json.Results)) {
      results = json.Results;
    } else if (Array.isArray(json.results)) {
      results = json.results;
    }
    // Support Trivy Cluster schema: Findings (with Namespace/Kind/Name)
    if (Array.isArray(json.Findings)) {
      json.Findings.forEach(f => {
        const rlist = f.Results || f.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: f.Namespace, Kind: f.Kind, Name: f.Name } });
        });
      });
    } else if (Array.isArray(json.findings)) {
      json.findings.forEach(f => {
        const rlist = f.Results || f.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: f.Namespace, Kind: f.Kind, Name: f.Name } });
        });
      });
    }
    // Support alternative Trivy Cluster schema: Resources (Kind/Name)
    if (Array.isArray(json.Resources)) {
      json.Resources.forEach(res => {
        const rlist = res.Results || res.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: res.Namespace, Kind: res.Kind, Name: res.Name } });
        });
      });
    } else if (Array.isArray(json.resources)) {
      json.resources.forEach(res => {
        const rlist = res.Results || res.results || [];
        rlist.forEach(r => {
          results.push({ ...r, _ctx: { Namespace: res.Namespace, Kind: res.Kind, Name: res.Name } });
        });
      });
    }

    const list = [];
    results.forEach(r => {
      const mis = r.Misconfigurations || r.misconfigurations || [];
      const ctx = r._ctx || {};
      mis.forEach(m => {
        const composedTarget = r.Target || r.target || [ctx.Namespace, (ctx.Kind && ctx.Name) ? `${ctx.Kind}/${ctx.Name}` : (ctx.Kind || ctx.Name)].filter(Boolean).join(' ');
        list.push({
          severity: (m.Severity || m.severity || "UNKNOWN").toUpperCase(),
          id: m.ID || m.id || "",
          title: m.Title || m.title || "",
          msg: m.Message || m.message || m.Description || m.description || "",
          status: (m.Status || m.status || 'FAIL').toUpperCase(),
          target: composedTarget || "Kubernetes",
          type: 'Misconfig',
          link: m.PrimaryURL || m.primaryURL || (m.References && m.References[0]) || ""
        });
      });
      // Handle Vulnerabilities (if any in cluster scan)
      const vuls = r.Vulnerabilities || r.vulnerabilities || [];
      vuls.forEach(v => {
        list.push({
          severity: (v.Severity || v.severity || 'UNKNOWN').toUpperCase(),
          id: v.VulnerabilityID || v.vulnerabilityID || '',
          title: v.Title || v.title || '',
          msg: `Pkg: ${v.PkgName} ${v.InstalledVersion}`,
          status: 'FAIL',
          target: r.Target || r.target || '',
          type: 'Vuln',
          link: v.PrimaryURL || v.primaryURL || (v.References && v.References[0]) || ""
        });
      });
    });

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }


  // --- Helpers ---
  const getStatusColor = (status) => {
    const map = {
      FAIL: 'text-red-400 bg-red-400/10 border-red-400/20',
      WARN: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
      PASS: 'text-green-400 bg-green-400/10 border-green-400/20',
      CRITICAL: 'text-red-500 bg-red-500/10 border-red-500/20',
      HIGH: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
      MEDIUM: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
      LOW: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
      UNKNOWN: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
      INFO: 'text-gray-400 bg-gray-400/10 border-gray-400/20'
    };
    return map[status] || map.UNKNOWN;
  };

  const StatusCard = ({ label, value }) => (
    <div className={`p-4 rounded-lg border bg-[#1e1e1e] flex flex-col items-center justify-center min-w-[100px] ${getStatusColor(label).replace('text-', 'border-')}`}>
      <span className="text-xs font-semibold opacity-70 mb-1">{label}</span>
      <span className={`text-2xl font-bold ${getStatusColor(label).split(' ')[0]}`}>{value}</span>
    </div>
  );

  // Calculate display counts dynamically based on namespace filter
  const kyvernoDisplayCounts = React.useMemo(() => {
    const c = { FAIL: 0, WARN: 0, ERROR: 0, SKIP: 0, PASS: 0 };
    kyvernoData.rows.forEach(r => {
      if (kyvernoNs && kyvernoNs !== 'ALL' && r.namespace !== kyvernoNs) return;
      c[r.status] = (c[r.status] || 0) + 1;
    });
    return c;
  }, [kyvernoData.rows, kyvernoNs]);

  return (
    <div className="h-full flex flex-col bg-[#0e1116] text-[#c9d1d9] font-sans">
      {/* Header Tabs */}
      <div className="flex items-center gap-2 p-4 border-b border-[#30363d] bg-[#161b22] overflow-x-auto">

        <button
          onClick={() => setActiveView('kyverno')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'kyverno' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <Shield className="w-4 h-4" /> Policy Report
        </button>
        <button
          onClick={() => setActiveView('sbom')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'sbom' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <Package className="w-4 h-4" /> SBOM Report
        </button>
        <button
          onClick={() => setActiveView('image')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'image' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <ImageIcon className="w-4 h-4" /> Image Scan Report
        </button>
        <button
          onClick={() => setActiveView('nmap')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'nmap' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <Globe className="w-4 h-4" /> Network (SSL) Report
        </button>
        <button
          onClick={() => setActiveView('cis')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'cis' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <ClipboardList className="w-4 h-4" /> CIS Benchmark Report
        </button>
        <button
          onClick={() => setActiveView('cluster')}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-all whitespace-nowrap border ${activeView === 'cluster' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)] font-bold' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-600'}`}
        >
          <Server className="w-4 h-4" /> Trivy Cluster
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-full text-blue-400 gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            Loading Report...
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-900/20 border border-red-500/30 rounded-lg text-red-200 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h3 className="font-bold">Error Loading Report</h3>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* KYVERNO */}
        {!loading && !error && activeView === 'kyverno' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS'].map(s => (
                <StatusCard key={s} label={s} value={kyvernoDisplayCounts[s] || 0} />
              ))}
              <div className="p-4 rounded-lg border border-gray-700 bg-[#1e1e1e] flex flex-col items-center justify-center">
                <span className="text-xs font-semibold opacity-70 mb-1">TOTAL</span>
                <span className="text-2xl font-bold text-gray-200">
                  {Object.values(kyvernoDisplayCounts).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 bg-[#161b22] p-4 rounded-lg border border-[#30363d]">
                <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Namespace</div>
                <select
                  value={kyvernoNs}
                  onChange={(e) => setKyvernoNs(e.target.value)}
                  className="w-full bg-[#0e1116] border border-[#30363d] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">None</option>
                  <option value="ALL">All Namespaces</option>
                  {Array.from(new Set(kyvernoData.rows.map(r => r.namespace).filter(Boolean))).sort().map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-8 bg-[#161b22] p-4 rounded-lg border border-[#30363d] flex items-center">
                <div className="flex flex-wrap gap-4 items-center">
                  <span className="text-xs text-gray-400 font-mono uppercase">Filter Status:</span>
                  {['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS'].map(status => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer select-none">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${kyvernoStatusFilters[status]
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-transparent border-gray-600 hover:border-gray-500'
                        }`}>
                        {kyvernoStatusFilters[status] && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={kyvernoStatusFilters[status]}
                        onChange={() => setKyvernoStatusFilters(prev => ({ ...prev, [status]: !prev[status] }))}
                      />
                      <span className={`text-xs font-bold ${getStatusColor(status).split(' ')[0]}`}>{status}</span>
                    </label>
                  ))}
                </div>
                <a
                  href="/new/kyverno-report/Policy_report.xlsx"
                  download="Policy_report.xlsx"
                  className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 border border-[#1f6feb]/30 rounded text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" /> Download Excel Report
                </a>
              </div>
            </div>

            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-200 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d] w-24">Status</th>
                    <th className="p-3 border-b border-[#30363d] w-24">Severity</th>
                    <th className="p-3 border-b border-[#30363d]">Policy</th>
                    <th className="p-3 border-b border-[#30363d] w-32">Type</th>
                    <th className="p-3 border-b border-[#30363d]">Resource</th>
                    <th className="p-3 border-b border-[#30363d]">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {kyvernoData.rows
                    .filter(r => {
                      if (kyvernoNs === "") return false; // None selected
                      if (kyvernoNs === "ALL") return kyvernoStatusFilters[r.status]; // All selected
                      return r.namespace === kyvernoNs && kyvernoStatusFilters[r.status]; // Specific namespace
                    })
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-blue-300">{row.policy}</td>
                        <td className="p-3 text-gray-200">{row.type}</td>
                        <td className="p-3 text-gray-100">{row.name}</td>
                        <td className="p-3 text-gray-200 break-words max-w-md">{row.message}</td>
                      </tr>
                    ))}
                  {(!kyvernoNs || kyvernoData.rows.length === 0) && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">
                      {!kyvernoNs ? "Select a namespace to view report" : "No data available"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CIS BENCHMARK */}
        {!loading && !error && activeView === 'cis' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {['FAIL', 'WARN', 'INFO', 'PASS'].map(s => (
                <StatusCard key={s} label={s} value={cisData.counts[s] || 0} />
              ))}
              <div className="p-4 rounded-lg border border-gray-700 bg-[#1e1e1e] flex flex-col items-center justify-center">
                <span className="text-xs font-semibold opacity-70 mb-1">TOTAL</span>
                <span className="text-2xl font-bold text-gray-200">
                  {Object.values(cisData.counts).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-[#161b22] p-3 rounded-lg border border-[#30363d]">
              <span className="text-xs text-gray-400 font-mono uppercase">Filter Status:</span>
              {['FAIL', 'WARN', 'INFO', 'PASS'].map(status => (
                <label key={status} className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${cisStatusFilters[status]
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-transparent border-gray-600 hover:border-gray-500'
                    }`}>
                    {cisStatusFilters[status] && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={cisStatusFilters[status]}
                    onChange={() => setCisStatusFilters(prev => ({ ...prev, [status]: !prev[status] }))}
                  />
                  <span className={`text-xs font-bold ${getStatusColor(status).split(' ')[0]}`}>{status}</span>
                </label>
              ))}
            </div>

            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-400 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d] w-24 text-center text-gray-200">Status</th>
                    <th className="p-3 border-b border-[#30363d] w-24 text-gray-200">Check ID</th>
                    <th className="p-3 border-b border-[#30363d] w-64 text-gray-200">Section</th>
                    <th className="p-3 border-b border-[#30363d] text-gray-200">Title</th>
                    <th className="p-3 border-b border-[#30363d] w-[40%] text-gray-200">Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {cisData.list
                    .filter(r => cisStatusFilters[r.status])
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-blue-300">{row.id}</td>
                        <td className="p-3 text-gray-200 text-sm font-semibold">{row.section || '-'}</td>
                        <td className="p-3 text-gray-200">{row.desc}</td>
                        <td className="p-3 text-gray-200 text-xs font-mono break-all max-w-sm">{row.remediation}</td>
                      </tr>
                    ))}
                  {cisData.list.filter(r => cisStatusFilters[r.status]).length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No benchmarks found matching filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CLUSTER REPORT */}
        {!loading && !error && activeView === 'cluster' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={clusterData.counts[s] || 0} />
              ))}
              <div className="p-4 rounded-lg border border-gray-700 bg-[#1e1e1e] flex flex-col items-center justify-center">
                <span className="text-xs font-semibold opacity-70 mb-1">TOTAL</span>
                <span className="text-2xl font-bold text-gray-200">
                  {Object.values(clusterData.counts).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-[#161b22] p-3 rounded-lg border border-[#30363d]">
              <span className="text-xs text-gray-400 font-mono uppercase">Filter Severity:</span>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                <label key={sev} className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${clusterSeverityFilters[sev]
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-transparent border-gray-600 hover:border-gray-500'
                    }`}>
                    {clusterSeverityFilters[sev] && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={clusterSeverityFilters[sev]}
                    onChange={() => setClusterSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))}
                  />
                  <span className={`text-xs font-bold ${sev === 'CRITICAL' ? 'text-red-500' :
                    sev === 'HIGH' ? 'text-orange-400' :
                      sev === 'MEDIUM' ? 'text-yellow-400' :
                        sev === 'LOW' ? 'text-blue-400' : 'text-gray-400'
                    }`}>{sev}</span>
                </label>
              ))}
            </div>

            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-200 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d] w-24 text-gray-200">Severity</th>
                    <th className="p-3 border-b border-[#30363d] text-gray-200">ID</th>
                    <th className="p-3 border-b border-[#30363d] w-1/3 text-gray-200">Title</th>
                    <th className="p-3 border-b border-[#30363d] w-1/3 text-gray-200">Message</th>
                    <th className="p-3 border-b border-[#30363d] w-16 text-gray-200">Ref</th>
                    <th className="p-3 border-b border-[#30363d] w-40 text-gray-200">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {clusterData.list
                    .filter(row => clusterSeverityFilters[row.severity])
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-blue-300">{row.id}</td>
                        <td className="p-3 text-gray-100 pointer-events-none" title={row.title}>{row.title}</td>
                        <td className="p-3 text-gray-200 max-w-xs break-words">{row.msg}</td>
                        <td className="p-3 text-blue-300">
                          {row.link ? (
                            <a href={row.link} target="_blank" rel="noopener noreferrer" className="hover:underline">Link</a>
                          ) : '-'}
                        </td>
                        <td className="p-3 text-gray-200">{row.target}</td>
                      </tr>
                    ))}
                  {clusterData.list.filter(row => clusterSeverityFilters[row.severity]).length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-400">No issues found matching filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && !error && activeView === 'sbom' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={sbomData.counts[s] || 0} />
              ))}
              <div className="p-4 rounded-lg border border-gray-700 bg-[#1e1e1e] flex flex-col items-center justify-center">
                <span className="text-xs font-semibold opacity-70 mb-1">TOTAL</span>
                <span className="text-2xl font-bold text-gray-200">
                  {Object.values(sbomData.counts).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-[#161b22] p-3 rounded-lg border border-[#30363d]">
              <span className="text-xs text-gray-400 font-mono uppercase">Filter Severity:</span>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                <label key={sev} className="flex items-center gap-2 cursor-pointer select-none">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${sbomSeverityFilters[sev]
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-transparent border-gray-600 hover:border-gray-500'
                    }`}>
                    {sbomSeverityFilters[sev] && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={sbomSeverityFilters[sev]}
                    onChange={() => setSbomSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))}
                  />
                  <span className={`text-xs font-bold ${sev === 'CRITICAL' ? 'text-red-500' :
                    sev === 'HIGH' ? 'text-orange-400' :
                      sev === 'MEDIUM' ? 'text-yellow-400' :
                        sev === 'LOW' ? 'text-blue-400' : 'text-gray-400'
                    }`}>{sev}</span>
                </label>
              ))}
            </div>

            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-200 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d]">Severity</th>
                    <th className="p-3 border-b border-[#30363d]">Library</th>
                    <th className="p-3 border-b border-[#30363d]">Vulnerability ID</th>
                    <th className="p-3 border-b border-[#30363d]">Installed</th>
                    <th className="p-3 border-b border-[#30363d]">Fixed</th>
                    <th className="p-3 border-b border-[#30363d]">Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {sbomData.list
                    .filter(row => sbomSeverityFilters[row.severity])
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-gray-200">{row.library}</td>
                        <td className="p-3 font-mono text-blue-300">
                          {row.ref ? (
                            <a href={row.ref} target="_blank" rel="noreferrer" className="hover:underline">{row.id}</a>
                          ) : row.id}
                        </td>
                        <td className="p-3 text-gray-200">{row.installed}</td>
                        <td className="p-3 text-gray-200">{row.fixed}</td>
                        <td className="p-3 text-gray-200 break-words" title={row.title}>{row.title}</td>
                      </tr>
                    ))}
                  {sbomData.list.filter(row => sbomSeverityFilters[row.severity]).length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">No vulnerabilities found matching filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* IMAGE SCANS */}
        {!loading && !error && activeView === 'image' && (
          <div className="space-y-6">

            {/* Controls Area */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Selection Controls */}
              <div className="md:col-span-4 bg-[#161b22] p-4 rounded-lg border border-[#30363d] space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Reports by Namespace</div>
                  <select
                    value={imageNs}
                    onChange={(e) => {
                      const val = e.target.value;
                      setImageNs(val);
                      // Reset file selection when namespace changes
                      if (!val) {
                        setSelectedImageFile(null);
                        return;
                      }
                      const relevant = imageFiles.filter(f => val === 'ALL' || f.startsWith(val + '/'));
                      if (relevant.length > 0) setSelectedImageFile(relevant[0]);
                      else setSelectedImageFile(null);
                    }}
                    className="w-full bg-[#0e1116] border border-[#30363d] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">None</option>
                    <option value="ALL">All Namespaces</option>
                    {Array.from(new Set(imageFiles.map(f => f.split('/')[0]))).sort().map(ns => (
                      <option key={ns} value={ns}>{ns}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Image Report</div>
                  <select
                    value={selectedImageFile || ''}
                    onChange={(e) => setSelectedImageFile(e.target.value)}
                    className="w-full bg-[#0e1116] border border-[#30363d] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    {imageFiles
                      .filter(f => imageNs === 'ALL' || (imageNs && f.startsWith(imageNs + '/')))
                      .map(f => (
                        <option key={f} value={f}>{f.replace(/^[^/]+\//, '').replace('.json', '')}</option>
                      ))}
                    {imageFiles.filter(f => imageNs === 'ALL' || (imageNs && f.startsWith(imageNs + '/'))).length === 0 && (
                      <option value="" disabled>No reports found</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Right: Summary and Filters */}
              <div className="md:col-span-8 bg-[#161b22] p-4 rounded-lg border border-[#30363d] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-gray-200">Image Vulnerabilities Report</span>
                  <a
                    href="/new/trivy-reports/consolidated-report_images.xlsx"
                    download="consolidated-report_images.xlsx"
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 border border-[#1f6feb]/30 rounded text-xs font-semibold transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download Excel Report
                  </a>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  <span className="text-xs text-gray-400 font-mono uppercase">Filter Severity:</span>
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                    <label key={sev} className="flex items-center gap-2 cursor-pointer select-none">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${imageSeverityFilters[sev]
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-transparent border-gray-600 hover:border-gray-500'
                        }`}>
                        {imageSeverityFilters[sev] && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={imageSeverityFilters[sev]}
                        onChange={() => setImageSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))}
                      />
                      <span className={`text-xs font-bold ${sev === 'CRITICAL' ? 'text-red-500' :
                        sev === 'HIGH' ? 'text-orange-400' :
                          sev === 'MEDIUM' ? 'text-yellow-400' :
                            sev === 'LOW' ? 'text-blue-400' : 'text-gray-400'
                        }`}>{sev}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={imageData.counts[s] || 0} />
              ))}
              <div className="p-4 rounded-lg border border-gray-700 bg-[#1e1e1e] flex flex-col items-center justify-center">
                <span className="text-xs font-semibold opacity-70 mb-1">TOTAL</span>
                <span className="text-2xl font-bold text-gray-200">
                  {Object.values(imageData.counts).reduce((a, b) => a + b, 0)}
                </span>
              </div>
            </div>

            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-400 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d]">Severity</th>
                    <th className="p-3 border-b border-[#30363d]">CVE</th>
                    <th className="p-3 border-b border-[#30363d]">Package</th>
                    <th className="p-3 border-b border-[#30363d]">Installed</th>
                    <th className="p-3 border-b border-[#30363d]">Fixed</th>
                    <th className="p-3 border-b border-[#30363d]">Title</th>
                    <th className="p-3 border-b border-[#30363d]">Target</th>
                    <th className="p-3 border-b border-[#30363d]">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {imageData.list
                    .filter(row => imageSeverityFilters[row.severity])
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>
                            {row.severity}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-gray-200">{row.id}</td>
                        <td className="p-3 font-medium text-gray-200">{row.pkg}</td>
                        <td className="p-3 text-gray-200">{row.installed}</td>
                        <td className="p-3 text-gray-200">{row.fixed}</td>
                        <td className="p-3 text-gray-200 break-words" title={row.title}>{row.title}</td>
                        <td className="p-3 text-gray-200 break-words max-w-xs">{row.target}</td>
                        <td className="p-3 font-mono text-blue-400">
                          {row.refs && row.refs[0] ? (
                            <a href={row.refs[0]} target="_blank" rel="noreferrer" className="hover:underline">link</a>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  {imageData.list.filter(row => imageSeverityFilters[row.severity]).length === 0 && (
                    <tr><td colSpan="8" className="p-8 text-center text-gray-500">No vulnerabilities found matching filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* NMAP / SSL */}
        {!loading && !error && activeView === 'nmap' && (
          <div className="space-y-6">
            <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#161b22] text-gray-200 font-medium">
                  <tr>
                    <th className="p-3 border-b border-[#30363d]">Namespace</th>
                    <th className="p-3 border-b border-[#30363d]">FQDN</th>
                    <th className="p-3 border-b border-[#30363d]">Port</th>
                    <th className="p-3 border-b border-[#30363d]">Accepted Ciphers</th>
                    <th className="p-3 border-b border-[#30363d]">Weak Ciphers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {nmapData
                    .filter(row => row.accepted && row.accepted.length > 0)
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#161b22]/50 transition-colors">
                        <td className="p-3 text-gray-200">{row.namespace}</td>
                        <td className="p-3 text-blue-300">{row.fqdn}</td>
                        <td className="p-3 text-gray-200 font-mono">{row.port}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.accepted.length > 0 ? row.accepted.map(c => (
                              <span key={c} className="px-1.5 py-0.5 bg-green-900/40 text-green-300 text-xs rounded border border-green-800">{c}</span>
                            )) : <span className="text-gray-600 text-xs">None</span>}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.weak.length > 0 ? row.weak.map(c => (
                              <span key={c} className="px-1.5 py-0.5 bg-red-900/40 text-red-300 text-xs rounded border border-red-800">{c}</span>
                            )) : <span className="text-gray-600 text-xs">None</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {nmapData.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No network scan data available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
