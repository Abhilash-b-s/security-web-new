import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Shield, FileJson, AlertTriangle, CheckCircle, XCircle, Info, Hash, Clock, Download, ChevronRight, ChevronDown, Package, Layers, Image as ImageIcon, Globe, ClipboardList, Server, Code, GitGraph, Search } from 'lucide-react';

export default function PolicyReports() {
  const [activeView, setActiveView] = useState('kyverno'); // kyverno | sbom | image | nmap | cis | cluster | trivy-repo
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

  // Git Repo Report State
  const [trivyRepoFiles, setTrivyRepoFiles] = useState([]);
  const [selectedTrivyRepoFile, setSelectedTrivyRepoFile] = useState(null);
  const [trivyRepoData, setTrivyRepoData] = useState({ list: [], counts: {} });

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

  // Git Repo Filters
  const [trivyRepoSeverityFilters, setTrivyRepoSeverityFilters] = useState({
    CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true
  });

  // CVE / ID Search
  const [imageSearch, setImageSearch] = useState('');
  const [sbomSearch, setSbomSearch] = useState('');
  const [trivyRepoSearch, setTrivyRepoSearch] = useState('');

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
    } else if (activeView === 'trivy-repo') {
      fetchTrivyRepoFiles();
    }
  }, [activeView]);

  // Load Image Data when file selected
  useEffect(() => {
    if (activeView === 'image' && selectedImageFile) {
      loadImageReport(selectedImageFile);
    }
  }, [selectedImageFile]);

  // Load Git Repo Data when file selected
  useEffect(() => {
    if (activeView === 'trivy-repo' && selectedTrivyRepoFile) {
      loadTrivyRepoReport(selectedTrivyRepoFile);
    }
  }, [selectedTrivyRepoFile]);


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

  const fetchTrivyRepoFiles = async () => {
    if (trivyRepoFiles.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/files/list?subpath=trivy_repo_scan');
      if (!res.ok) throw new Error(`Failed to list repo reports: ${res.status}`);
      const files = await res.json();
      setTrivyRepoFiles(files);
      if (files.length > 0) setSelectedTrivyRepoFile(files[0]);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadTrivyRepoReport = async (filename) => {
    setLoading(true);
    try {
      const res = await fetch(`/new/trivy_repo_scan/${filename}`);
      if (!res.ok) throw new Error(`Failed to load report ${filename}: ${res.status}`);
      const json = await res.json();
      const parsed = parseTrivyRepo(json);
      setTrivyRepoData(parsed);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  // --- Parsers ---

  function getCvssScore(v) {
    if (!v.CVSS) return null;
    for (const source of Object.values(v.CVSS)) {
      if (source.V3Score != null) return parseFloat(source.V3Score);
    }
    for (const source of Object.values(v.CVSS)) {
      if (source.V2Score != null) return parseFloat(source.V2Score);
    }
    return null;
  }

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
          ref: Array.isArray(v.References) && v.References.length ? v.References[0] : (v.PrimaryURL || ''),
          cvss: getCvssScore(v)
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
          refs: v.References || v.references || [],
          cvss: getCvssScore(v)
        });
      });
    });
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    list.forEach(item => { counts[item.severity] = (counts[item.severity] || 0) + 1; });
    return { list, counts };
  }

  function parseTrivyRepo(json) {
    if (!json) return { list: [], counts: {} };
    const list = [];
    const results = json.Results || [];

    results.forEach(res => {
      const target = res.Target || '';

      // Handle Packages (Vulnerabilities)
      if (res.Vulnerabilities) {
        res.Vulnerabilities.forEach(v => {
          list.push({
            type: 'Vulnerability',
            severity: (v.Severity || 'UNKNOWN').toUpperCase(),
            id: v.VulnerabilityID || '',
            pkg: v.PkgName || '',
            installed: v.InstalledVersion || '',
            fixed: v.FixedVersion || '',
            title: v.Title || '',
            desc: v.Description || '',
            target: target,
            refs: v.References || [],
            cvss: getCvssScore(v)
          });
        });
      }

      // Handle Secrets
      if (res.Secrets) {
        res.Secrets.forEach(s => {
          list.push({
            type: 'Secret',
            severity: (s.Severity || 'UNKNOWN').toUpperCase(),
            id: s.RuleID || '',
            pkg: s.Category || '',
            installed: `Lines ${s.StartLine}-${s.EndLine}`,
            fixed: 'N/A',
            title: s.Title || '',
            desc: 'Code Match',
            target: target,
            refs: []
          });
        });
      }
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
      FAIL: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-300 dark:border-red-400/20',
      ERROR: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-300 dark:border-red-400/20',
      WARN: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10 border-yellow-300 dark:border-yellow-400/20',
      PASS: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-400/10 border-green-300 dark:border-green-400/20',
      SKIP: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-400/10 border-slate-300 dark:border-slate-400/20',
      CRITICAL: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-300 dark:border-red-400/20',
      HIGH: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-400/10 border-orange-300 dark:border-orange-400/20',
      MEDIUM: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-400/10 border-yellow-300 dark:border-yellow-400/20',
      LOW: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10 border-blue-300 dark:border-blue-400/20',
      UNKNOWN: 'text-gray-900 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10 border-gray-300 dark:border-gray-400/20',
      INFO: 'text-gray-900 dark:text-gray-400 bg-gray-50 dark:bg-gray-400/10 border-gray-300 dark:border-gray-400/20'
    };
    return map[status] || map.UNKNOWN;
  };

  const SeverityBadge = ({ level }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(level)}`}>
      {level}
    </span>
  );

  const CVSS_BAR_COLORS = { CRITICAL: '#DC2626', HIGH: '#EA580C', MEDIUM: '#F59E0B', LOW: '#3B82F6', UNKNOWN: '#6B7280' };

  const CvssBar = ({ score, severity }) => {
    if (score === null || score === undefined) return <span className="text-gray-400 dark:text-gray-600 text-xs font-mono">—</span>;
    return (
      <div className="flex items-center gap-1.5 min-w-[72px]">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(score / 10) * 100}%`, backgroundColor: CVSS_BAR_COLORS[severity] || CVSS_BAR_COLORS.UNKNOWN }} />
        </div>
        <span className="text-xs font-mono text-gray-700 dark:text-gray-300 w-7 text-right">{score.toFixed(1)}</span>
      </div>
    );
  };

  const ACCENT_BORDER = {
    FAIL: 'border-l-red-500', ERROR: 'border-l-red-500', WARN: 'border-l-yellow-500',
    PASS: 'border-l-green-500', SKIP: 'border-l-slate-400', INFO: 'border-l-slate-400',
    CRITICAL: 'border-l-red-600', HIGH: 'border-l-orange-500', MEDIUM: 'border-l-yellow-400',
    LOW: 'border-l-blue-500', UNKNOWN: 'border-l-gray-400', TOTAL: 'border-l-slate-400',
  };
  const NUM_COLOR = {
    FAIL: 'text-red-600 dark:text-red-400', ERROR: 'text-red-600 dark:text-red-400',
    WARN: 'text-yellow-600 dark:text-yellow-400', PASS: 'text-green-600 dark:text-green-400',
    SKIP: 'text-slate-500 dark:text-slate-400', INFO: 'text-slate-500 dark:text-slate-400',
    CRITICAL: 'text-red-700 dark:text-red-500', HIGH: 'text-orange-600 dark:text-orange-400',
    MEDIUM: 'text-yellow-500 dark:text-yellow-400', LOW: 'text-blue-600 dark:text-blue-400',
    UNKNOWN: 'text-gray-500 dark:text-gray-400', TOTAL: 'text-gray-700 dark:text-gray-200',
  };

  const StatusCard = ({ label, value }) => (
    <div className={`bg-white dark:bg-[#1a2332] border border-gray-200 dark:border-gray-700/60 border-l-4 ${ACCENT_BORDER[label] || 'border-l-gray-400'} rounded-lg p-4 flex flex-col gap-1 shadow-sm`}>
      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
      <span className={`text-3xl font-black ${NUM_COLOR[label] || 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
    </div>
  );

  const DIST_COLORS = {
    CRITICAL: 'bg-red-600', HIGH: 'bg-orange-500', MEDIUM: 'bg-yellow-400',
    LOW: 'bg-blue-500', UNKNOWN: 'bg-gray-400', FAIL: 'bg-red-500',
    WARN: 'bg-yellow-500', ERROR: 'bg-red-700', PASS: 'bg-green-500',
    SKIP: 'bg-slate-400', INFO: 'bg-slate-400',
  };
  const DIST_TEXT = {
    CRITICAL: 'text-red-500', HIGH: 'text-orange-400', MEDIUM: 'text-yellow-400',
    LOW: 'text-blue-400', UNKNOWN: 'text-gray-400', FAIL: 'text-red-400',
    WARN: 'text-yellow-400', ERROR: 'text-red-500', PASS: 'text-green-400',
    SKIP: 'text-slate-400', INFO: 'text-slate-400',
  };

  const SeverityDistBar = ({ counts, keys }) => {
    const total = keys.reduce((s, k) => s + (counts[k] || 0), 0);
    if (!total) return null;
    return (
      <div className="bg-white dark:bg-[#1a2332] border border-gray-200 dark:border-gray-700/60 rounded-lg px-5 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Risk Distribution</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{total.toLocaleString()} findings</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {keys.filter(k => counts[k] > 0).map(k => (
            <div key={k} title={`${k}: ${counts[k]}`}
              className={`${DIST_COLORS[k] || 'bg-gray-400'} transition-all`}
              style={{ width: `${(counts[k] / total) * 100}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-2.5">
          {keys.filter(k => counts[k] > 0).map(k => (
            <span key={k} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-sm ${DIST_COLORS[k] || 'bg-gray-400'} shrink-0`} />
              <span className={`font-semibold ${DIST_TEXT[k] || 'text-gray-400'}`}>{k}</span>
              <span className="text-gray-400 dark:text-gray-500">{((counts[k] / total) * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const FilterPill = ({ label, active, onToggle }) => {
    const activeStyle = {
      FAIL: 'bg-red-100 dark:bg-red-500/20 border-red-400 dark:border-red-500/50 text-red-700 dark:text-red-300',
      ERROR: 'bg-red-100 dark:bg-red-500/20 border-red-400 dark:border-red-500/50 text-red-700 dark:text-red-300',
      WARN: 'bg-yellow-100 dark:bg-yellow-500/20 border-yellow-400 dark:border-yellow-500/50 text-yellow-700 dark:text-yellow-300',
      PASS: 'bg-green-100 dark:bg-green-500/20 border-green-400 dark:border-green-500/50 text-green-700 dark:text-green-300',
      SKIP: 'bg-slate-100 dark:bg-slate-500/20 border-slate-400 dark:border-slate-500/50 text-slate-600 dark:text-slate-300',
      INFO: 'bg-slate-100 dark:bg-slate-500/20 border-slate-400 dark:border-slate-500/50 text-slate-600 dark:text-slate-300',
      CRITICAL: 'bg-red-100 dark:bg-red-600/20 border-red-500 dark:border-red-600/50 text-red-800 dark:text-red-400',
      HIGH: 'bg-orange-100 dark:bg-orange-500/20 border-orange-400 dark:border-orange-500/50 text-orange-700 dark:text-orange-300',
      MEDIUM: 'bg-yellow-100 dark:bg-yellow-400/20 border-yellow-400 dark:border-yellow-400/50 text-yellow-700 dark:text-yellow-300',
      LOW: 'bg-blue-100 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500/50 text-blue-700 dark:text-blue-300',
      UNKNOWN: 'bg-gray-100 dark:bg-gray-500/20 border-gray-400 dark:border-gray-500/50 text-gray-600 dark:text-gray-400',
    };
    return (
      <button type="button" onClick={onToggle}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${active
          ? (activeStyle[label] || 'bg-blue-100 dark:bg-blue-500/20 border-blue-400 text-blue-700')
          : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'
        }`}
      >
        {label}
      </button>
    );
  };

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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0e1116] text-gray-900 dark:text-[#c9d1d9] font-sans transition-colors duration-200">
      {/* Header Tabs — pill button style */}
      <div className="bg-white dark:bg-[#161b22] border-b border-gray-200 dark:border-[#30363d] transition-colors duration-200">
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto">
          {[
            { id: 'kyverno', label: 'Policy Compliance', icon: <Shield className="w-4 h-4" /> },
            { id: 'sbom', label: 'SBOM Inventory', icon: <Package className="w-4 h-4" /> },
            { id: 'trivy-repo', label: 'Source Code', icon: <GitGraph className="w-4 h-4" /> },
            { id: 'image', label: 'Image Vulnerabilities', icon: <ImageIcon className="w-4 h-4" /> },
            { id: 'nmap', label: 'Network Security', icon: <Globe className="w-4 h-4" /> },
            { id: 'cis', label: 'CIS Benchmarks', icon: <ClipboardList className="w-4 h-4" /> },
            { id: 'cluster', label: 'Cluster Risks', icon: <Server className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-all border-2 ${
                activeView === tab.id
                  ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-gray-800/60 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700 hover:text-slate-900 dark:hover:text-gray-200 hover:border-slate-400 dark:hover:border-gray-500'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-full text-blue-400 gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            Loading Report...
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-200 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h3 className="font-bold">Error Loading Report</h3>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* KYVERNO */}
        {!loading && !error && activeView === 'kyverno' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS'].map(s => (
                <StatusCard key={s} label={s} value={kyvernoDisplayCounts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(kyvernoDisplayCounts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={kyvernoDisplayCounts} keys={['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS']} />

            <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Namespace</span>
              <select
                value={kyvernoNs}
                onChange={(e) => setKyvernoNs(e.target.value)}
                className="bg-gray-50 dark:bg-[#0e1116] border border-gray-200 dark:border-[#30363d] rounded px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="">None</option>
                <option value="ALL">All Namespaces</option>
                {Array.from(new Set(kyvernoData.rows.map(r => r.namespace).filter(Boolean))).sort().map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </select>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {['FAIL', 'WARN', 'ERROR', 'SKIP', 'PASS'].map(status => (
                  <FilterPill key={status} label={status} active={kyvernoStatusFilters[status]}
                    onToggle={() => setKyvernoStatusFilters(prev => ({ ...prev, [status]: !prev[status] }))} />
                ))}
              </div>
              <a
                href="/new/kyverno-report/Policy_report.xlsx"
                download="Policy_report.xlsx"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/50 rounded-lg text-xs font-semibold transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </a>
            </div>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950 transition-colors">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Status</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Severity</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Policy</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-32">Type</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resource</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {kyvernoData.rows
                    .filter(r => {
                      if (kyvernoNs === "") return false;
                      if (kyvernoNs === "ALL") return kyvernoStatusFilters[r.status];
                      return r.namespace === kyvernoNs && kyvernoStatusFilters[r.status];
                    })
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>{row.severity}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">{row.policy}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 text-sm">{row.type}</td>
                        <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200 text-sm font-medium">{row.name}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm break-words max-w-md">{row.message}</td>
                      </tr>
                    ))}
                  {(!kyvernoNs || kyvernoData.rows.length === 0) && (
                    <tr><td colSpan="6" className="py-16 text-center">
                      <Shield className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">{!kyvernoNs ? "Select a namespace above to view policy results" : "No data available"}</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CIS BENCHMARK */}
        {!loading && !error && activeView === 'cis' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {['FAIL', 'WARN', 'INFO', 'PASS'].map(s => (
                <StatusCard key={s} label={s} value={cisData.counts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(cisData.counts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={cisData.counts} keys={['FAIL', 'WARN', 'INFO', 'PASS']} />

            <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {['FAIL', 'WARN', 'INFO', 'PASS'].map(status => (
                  <FilterPill key={status} label={status} active={cisStatusFilters[status]}
                    onToggle={() => setCisStatusFilters(prev => ({ ...prev, [status]: !prev[status] }))} />
                ))}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24 text-center">Status</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Check ID</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-56">Section</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-[38%]">Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {cisData.list
                    .filter(r => cisStatusFilters[r.status])
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">{row.id}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 text-sm font-semibold">{row.section || '-'}</td>
                        <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200 text-sm">{row.desc}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs font-mono break-all max-w-sm">{row.remediation}</td>
                      </tr>
                    ))}
                  {cisData.list.filter(r => cisStatusFilters[r.status]).length === 0 && (
                    <tr><td colSpan="5" className="py-16 text-center">
                      <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No benchmarks found matching filters</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CLUSTER REPORT */}
        {!loading && !error && activeView === 'cluster' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={clusterData.counts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(clusterData.counts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={clusterData.counts} keys={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']} />

            <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                  <FilterPill key={sev} label={sev} active={clusterSeverityFilters[sev]}
                    onToggle={() => setClusterSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))} />
                ))}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Severity</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">ID</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/3">Title</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/3">Message</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-14">Ref</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-40">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {clusterData.list
                    .filter(row => clusterSeverityFilters[row.severity])
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(row.severity)}`}>{row.severity}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">{row.id}</td>
                        <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200 text-sm">{row.title}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm max-w-xs break-words">{row.msg}</td>
                        <td className="px-3 py-2.5 text-blue-600 dark:text-blue-300 text-xs">
                          {row.link ? <a href={row.link} target="_blank" rel="noopener noreferrer" className="hover:underline">Link</a> : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-xs break-all">{row.target}</td>
                      </tr>
                    ))}
                  {clusterData.list.filter(row => clusterSeverityFilters[row.severity]).length === 0 && (
                    <tr><td colSpan="6" className="py-16 text-center">
                      <Server className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No issues found matching filters</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && !error && activeView === 'sbom' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={sbomData.counts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(sbomData.counts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={sbomData.counts} keys={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']} />

            <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                  <FilterPill key={sev} label={sev} active={sbomSeverityFilters[sev]}
                    onToggle={() => setSbomSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))} />
                ))}
              </div>
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" placeholder="Search CVE or library…" value={sbomSearch} onChange={e => setSbomSearch(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#0e1116] border border-gray-200 dark:border-[#30363d] rounded-lg pl-8 pr-8 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                {sbomSearch && <button onClick={() => setSbomSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><XCircle className="w-4 h-4" /></button>}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Severity</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">CVSS</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Library</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vulnerability ID</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Installed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fixed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {sbomData.list
                    .filter(row => sbomSeverityFilters[row.severity])
                    .filter(row => !sbomSearch || row.id.toLowerCase().includes(sbomSearch.toLowerCase()) || row.library.toLowerCase().includes(sbomSearch.toLowerCase()))
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5"><SeverityBadge level={row.severity} /></td>
                        <td className="px-3 py-2.5"><CvssBar score={row.cvss} severity={row.severity} /></td>
                        <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 text-sm">{row.library}</td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">
                          {row.ref ? (<a href={row.ref} target="_blank" rel="noreferrer" className="hover:underline">{row.id}</a>) : row.id}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.installed}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.fixed}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 text-sm break-words">{row.title}</td>
                      </tr>
                    ))}
                  {sbomData.list.filter(row => sbomSeverityFilters[row.severity]).filter(row => !sbomSearch || row.id.toLowerCase().includes(sbomSearch.toLowerCase()) || row.library.toLowerCase().includes(sbomSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan="7" className="py-16 text-center">
                      <Package className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No vulnerabilities found matching filters</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* IMAGE SCANS */}
        {/* IMAGE SCANS */}
        {!loading && !error && activeView === 'image' && (
          <div className="space-y-6">

            {/* Controls Area */}
            {/* Controls Area */}
            <div className="flex flex-col gap-4">
              {/* Top Row: Namespace and Report Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#161b22] p-4 rounded-lg border border-gray-300 dark:border-[#30363d] shadow-sm transition-colors duration-200">
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Reports by Namespace</div>
                  <select
                    value={imageNs}
                    onChange={(e) => {
                      const val = e.target.value;
                      setImageNs(val);
                      if (!val) {
                        setSelectedImageFile(null);
                        return;
                      }
                      const relevant = imageFiles.filter(f => val === 'ALL' || f.startsWith(val + '/'));
                      if (relevant.length > 0) setSelectedImageFile(relevant[0]);
                      else setSelectedImageFile(null);
                    }}
                    className="w-full bg-gray-50 dark:bg-[#0e1116] border border-gray-300 dark:border-[#30363d] rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-azure-500 transition-colors duration-200"
                  >
                    <option value="">None</option>
                    <option value="ALL">All Namespaces</option>
                    {Array.from(new Set(imageFiles.map(f => f.split('/')[0]))).sort().map(ns => (
                      <option key={ns} value={ns}>{ns}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-white dark:bg-[#161b22] p-4 rounded-lg border border-gray-300 dark:border-[#30363d] shadow-sm transition-colors duration-200">
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Image Report</div>
                  <select
                    value={selectedImageFile || ''}
                    onChange={(e) => setSelectedImageFile(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#0e1116] border border-gray-300 dark:border-[#30363d] rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-azure-500 transition-colors duration-200"
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

              {/* Filters row */}
              <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
                <div className="flex flex-wrap gap-1.5">
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                    <FilterPill key={sev} label={sev} active={imageSeverityFilters[sev]}
                      onToggle={() => setImageSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))} />
                  ))}
                </div>
                <div className="flex-1 min-w-[180px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Search CVE or package…" value={imageSearch} onChange={e => setImageSearch(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#0e1116] border border-gray-200 dark:border-[#30363d] rounded-lg pl-8 pr-8 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                  {imageSearch && <button onClick={() => setImageSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><XCircle className="w-4 h-4" /></button>}
                </div>
                <a href="/new/trivy-reports/consolidated-report_images.xlsx" download="consolidated-report_images.xlsx"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/50 rounded-lg text-xs font-semibold transition-all">
                  <Download className="w-3.5 h-3.5" /> Export
                </a>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={imageData.counts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(imageData.counts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={imageData.counts} keys={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']} />

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Severity</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">CVSS</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">CVE</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Package</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Installed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fixed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Target</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {imageData.list
                    .filter(row => imageSeverityFilters[row.severity])
                    .filter(row => !imageSearch || row.id.toLowerCase().includes(imageSearch.toLowerCase()) || row.pkg.toLowerCase().includes(imageSearch.toLowerCase()))
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5"><SeverityBadge level={row.severity} /></td>
                        <td className="px-3 py-2.5"><CvssBar score={row.cvss} severity={row.severity} /></td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">{row.id}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 text-sm">{row.pkg}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.installed}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.fixed}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 text-sm break-words">{row.title}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs break-all max-w-[120px]">{row.target}</td>
                        <td className="px-3 py-2.5 text-blue-600 dark:text-blue-400 text-xs">
                          {row.refs && row.refs[0] ? <a href={row.refs[0]} target="_blank" rel="noreferrer" className="hover:underline">link</a> : '—'}
                        </td>
                      </tr>
                    ))}
                  {imageData.list.filter(row => imageSeverityFilters[row.severity]).filter(row => !imageSearch || row.id.toLowerCase().includes(imageSearch.toLowerCase()) || row.pkg.toLowerCase().includes(imageSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan="9" className="py-16 text-center">
                      <ImageIcon className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No vulnerabilities found matching filters</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* NMAP / SSL */}
        {!loading && !error && activeView === 'nmap' && (
          <div className="space-y-4">
            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Namespace</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">FQDN</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Port</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Accepted Ciphers</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Weak Ciphers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {nmapData
                    .filter(row => row.accepted && row.accepted.length > 0)
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 text-sm">{row.namespace}</td>
                        <td className="px-3 py-2.5 text-blue-600 dark:text-blue-300 text-sm">{row.fqdn}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 font-mono text-xs">{row.port}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {row.accepted.length > 0 ? row.accepted.map(c => (
                              <span key={c} className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs rounded border border-green-200 dark:border-green-800">{c}</span>
                            )) : <span className="text-gray-400 text-xs">None</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {row.weak.length > 0 ? row.weak.map(c => (
                              <span key={c} className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs rounded border border-red-200 dark:border-red-800">{c}</span>
                            )) : <span className="text-gray-400 text-xs">None</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {nmapData.length === 0 && (
                    <tr><td colSpan="5" className="py-16 text-center">
                      <Globe className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No network scan data available</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRIVY REPO SCAN */}
        {!loading && !error && activeView === 'trivy-repo' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(s => (
                <StatusCard key={s} label={s} value={trivyRepoData.counts[s] || 0} />
              ))}
              <StatusCard label="TOTAL" value={Object.values(trivyRepoData.counts).reduce((a, b) => a + b, 0)} />
            </div>

            <SeverityDistBar counts={trivyRepoData.counts} keys={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']} />

            <div className="bg-white dark:bg-[#161b22] rounded-lg border border-gray-200 dark:border-[#30363d] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Report</span>
              <select
                value={selectedTrivyRepoFile || ''}
                onChange={(e) => setSelectedTrivyRepoFile(e.target.value)}
                className="bg-gray-50 dark:bg-[#0e1116] border border-gray-200 dark:border-[#30363d] rounded px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                {trivyRepoFiles.length === 0 && <option value="">No reports found</option>}
                {trivyRepoFiles.map(f => (
                  <option key={f} value={f}>{f.replace('.json', '')}</option>
                ))}
              </select>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map(sev => (
                  <FilterPill key={sev} label={sev} active={trivyRepoSeverityFilters[sev]}
                    onToggle={() => setTrivyRepoSeverityFilters(prev => ({ ...prev, [sev]: !prev[sev] }))} />
                ))}
              </div>
              <div className="flex-1 min-w-[180px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" placeholder="Search vulnerability or package…" value={trivyRepoSearch} onChange={e => setTrivyRepoSearch(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#0e1116] border border-gray-200 dark:border-[#30363d] rounded-lg pl-8 pr-8 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors" />
                {trivyRepoSearch && <button onClick={() => setTrivyRepoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><XCircle className="w-4 h-4" /></button>}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-[#30363d] rounded-lg overflow-hidden bg-white dark:bg-[#020617] shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Severity</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">CVSS</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">ID</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Package</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Installed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fixed</th>
                    <th className="px-3 py-3 border-b border-gray-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Target File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {trivyRepoData.list
                    .filter(r => trivyRepoSeverityFilters[r.severity])
                    .filter(r => !trivyRepoSearch || r.id.toLowerCase().includes(trivyRepoSearch.toLowerCase()) || r.pkg.toLowerCase().includes(trivyRepoSearch.toLowerCase()))
                    .map((row, idx) => (
                      <tr key={idx} className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-[#161b22]/60 ${idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.02]'}`}>
                        <td className="px-3 py-2.5"><SeverityBadge level={row.severity} /></td>
                        <td className="px-3 py-2.5"><CvssBar score={row.cvss} severity={row.severity} /></td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.type}</td>
                        <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-300 text-xs">{row.id}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 text-sm">{row.pkg}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{row.installed}</td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm">{row.fixed}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-xs break-all">{row.target}</td>
                      </tr>
                    ))}
                  {trivyRepoData.list.filter(r => trivyRepoSeverityFilters[r.severity]).filter(r => !trivyRepoSearch || r.id.toLowerCase().includes(trivyRepoSearch.toLowerCase()) || r.pkg.toLowerCase().includes(trivyRepoSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan="8" className="py-16 text-center">
                      <GitGraph className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No issues found — select a report above or adjust filters</p>
                    </td></tr>
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
