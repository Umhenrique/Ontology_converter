/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, FileType, Code, Download, FileCode, Copy, CheckCircle2, ArrowRight } from 'lucide-react';

export default function App() {
  const [owlContent, setOwlContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [stats, setStats] = useState({ classes: 0, props: 0, generalizations: 0 });
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'xml' | 'json'>('xml');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateOWL = (classes: any[], generalizations: any[], associations: any[], attributes: any[]) => {
      const safeId = (str: string) => {
        let res = str.replace(/[^a-zA-Z0-9_]/g, '_');
        res = res.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        if (/^[0-9]/.test(res)) {
          res = "E_" + res;
        }
        return res || "Entity";
      };

      const idToName: Record<string, string> = {};
      classes.forEach(c => {
        idToName[c.id] = safeId(c.name);
      });

      let owl = '<?xml version="1.0"?>\n';
      owl += '<rdf:RDF xmlns="http://www.semanticweb.org/ontology#"\n';
      owl += '     xml:base="http://www.semanticweb.org/ontology"\n';
      owl += '     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n';
      owl += '     xmlns:owl="http://www.w3.org/2002/07/owl#"\n';
      owl += '     xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">\n';
      owl += '    <owl:Ontology rdf:about="http://www.semanticweb.org/ontology"/>\n\n';

      associations.forEach(a => {
        if (idToName[a.from] && idToName[a.to]) {
          let baseName = safeId(a.name);
          if (baseName === 'Entity') baseName = 'Property';
          const propId = baseName + "_" + idToName[a.from] + "_" + idToName[a.to];
          owl += `    <owl:ObjectProperty rdf:about="#${propId}">\n`;
          owl += `        <rdfs:label xml:lang="en">${a.name}</rdfs:label>\n`;
          owl += `        <rdfs:domain rdf:resource="#${idToName[a.from]}"/>\n`;
          owl += `        <rdfs:range rdf:resource="#${idToName[a.to]}"/>\n`;
          owl += `    </owl:ObjectProperty>\n\n`;
        }
      });

      attributes.forEach(attr => {
        if (idToName[attr.domain]) {
          let baseName = safeId(attr.name);
          if (baseName === 'Entity') baseName = 'DataProperty';
          const propId = baseName + "_" + idToName[attr.domain];
          owl += `    <owl:DatatypeProperty rdf:about="#${propId}">\n`;
          owl += `        <rdfs:domain rdf:resource="#${idToName[attr.domain]}"/>\n`;
          owl += `        <rdfs:label xml:lang="en">${attr.name}</rdfs:label>\n`;
          owl += `    </owl:DatatypeProperty>\n\n`;
        }
      });

      classes.forEach(c => {
        const className = idToName[c.id];
        owl += `    <owl:Class rdf:about="#${className}">\n`;

        const subs = generalizations.filter(g => g.to === c.id);
        subs.forEach(g => {
          if (idToName[g.from]) {
            owl += `        <rdfs:subClassOf rdf:resource="#${idToName[g.from]}"/>\n`;
          }
        });

        owl += `        <rdfs:label xml:lang="en">${c.name}</rdfs:label>\n`;
        owl += `    </owl:Class>\n\n`;
      });

      owl += '</rdf:RDF>';

      setOwlContent(owl);
      setStats({
        classes: classes.length,
        props: associations.length + attributes.length,
        generalizations: generalizations.length
      });
      setError('');
  };

  const processFileContent = (content: string, name: string) => {
    setFileName(name);
    
    try {
      if (format === 'json') {
        const parsed = JSON.parse(content);
        if (!parsed.model || !parsed.model.contents) {
          throw new Error("Invalid OntoUML JSON file structure.");
        }

        const contents = parsed.model.contents;
        
        const classes = contents
          .filter((c: any) => c.type === 'Class')
          .map((c: any) => ({
            id: c.id,
            name: (c.name || '').trim()
          }))
          .filter((c: any) => c.id && c.name);

        const generalizations = contents
          .filter((c: any) => c.type === 'Generalization')
          .map((g: any) => ({
            id: g.id,
            from: g.general?.id || '',
            to: g.specific?.id || ''
          }))
          .filter((g: any) => g.from && g.to);

        const viewToModel: Record<string, string> = {};
        parsed.diagrams?.forEach((d: any) => {
          d.contents?.forEach((c: any) => {
            if (c.modelElement?.id) {
              viewToModel[c.id] = c.modelElement.id;
            }
          });
        });

        const relationDirection: Record<string, { from: string, to: string }> = {};
        parsed.diagrams?.forEach((d: any) => {
          d.contents?.forEach((c: any) => {
            if (c.type === 'RelationView' && c.modelElement?.id && c.source?.id && c.target?.id) {
               const modelId = c.modelElement.id;
               const fromModel = viewToModel[c.source.id];
               const toModel = viewToModel[c.target.id];
               if (fromModel && toModel) {
                 relationDirection[modelId] = { from: fromModel, to: toModel };
               }
            }
          });
        });

        const associations = contents
          .filter((c: any) => c.type === 'Relation')
          .map((a: any) => {
            let assocName = a.name || '';
            if (!assocName.trim() && a.stereotype) {
              assocName = a.stereotype;
            }
            if (!assocName.trim()) {
              assocName = "Property_" + a.id;
            }
            
            const props = a.properties || [];
            let fromId = props[0]?.propertyType?.id || '';
            let toId = props[1]?.propertyType?.id || '';
            
            if (relationDirection[a.id]) {
              fromId = relationDirection[a.id].from;
              toId = relationDirection[a.id].to;
            }

            return {
              id: a.id,
              name: assocName.trim(),
              from: fromId,
              to: toId
            };
          }).filter((a: any) => a.from && a.to);

        const attributes: { id: string, name: string, domain: string }[] = [];
        contents.filter((c: any) => c.type === 'Class').forEach((c: any) => {
          if (c.properties) {
            c.properties.forEach((p: any) => {
              if (p.type === 'Property' && p.name) {
                attributes.push({
                  id: p.id,
                  name: p.name.trim(),
                  domain: c.id
                });
              }
            });
          }
        });

        generateOWL(classes, generalizations, associations, attributes);

      } else {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");

        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          throw new Error("Invalid XML file structure. Not a valid XML document.");
        }

        const classes = Array.from(xmlDoc.querySelectorAll("Models Class")).map((c: Element) => ({
          id: c.getAttribute("Id") || '',
          name: (c.getAttribute("Name") || '').trim()
        })).filter(c => c.id && c.name);

        const generalizations = Array.from(xmlDoc.querySelectorAll("Models Generalization")).map((g: Element) => ({
          id: g.getAttribute("Id") || '',
          from: g.getAttribute("From") || '',
          to: g.getAttribute("To") || ''
        })).filter(g => g.from && g.to);

        const associations = Array.from(xmlDoc.querySelectorAll("Models Association")).map((a: Element) => {
          let assocName = a.getAttribute("Name") || '';
          if (!assocName.trim()) {
            const stereotypes = a.getElementsByTagName("Stereotype");
            if (stereotypes.length > 0) {
              assocName = stereotypes[0].getAttribute("Name") || '';
            }
          }
          if (!assocName.trim()) {
            assocName = "Property_" + a.getAttribute("Id");
          }
          
          return {
            id: a.getAttribute("Id") || '',
            name: assocName.trim(),
            from: a.getAttribute("EndRelationshipFromMetaModelElement") || '',
            to: a.getAttribute("EndRelationshipToMetaModelElement") || ''
          };
        }).filter(a => a.from && a.to);

        const attributes = Array.from(xmlDoc.querySelectorAll("Models Class Attribute")).map((attr: Element) => {
          const parentClassId = attr.closest("Class")?.getAttribute("Id");
          return {
            id: attr.getAttribute("Id") || '',
            name: (attr.getAttribute("Name") || '').trim(),
            domain: parentClassId || ''
          };
        }).filter(a => a.name && a.domain);

        if (classes.length === 0) {
          throw new Error("No classes found. Make sure this is a valid Visual Paradigm XML export.");
        }

        generateOWL(classes, generalizations, associations, attributes);
      }
    } catch (err: any) {
      setError(err.message || `Failed to parse ${format.toUpperCase()} and convert to OWL.`);
      setOwlContent('');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) processFileContent(content, file.name);
    };
    reader.readAsText(file);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(owlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    if (!owlContent) return;
    const blob = new Blob([owlContent], { type: 'application/rdf+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName ? fileName.replace(/\.(xml|json)$/i, '.owl') : 'ontology.owl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-theme-bg text-theme-ink font-theme-sans flex flex-col border border-theme-line">
      <header className="bg-theme-bg h-[60px] border-b-2 border-theme-line px-6 flex items-center shrink-0">
        <Code className="h-6 w-6 text-theme-ink mr-3" />
        <h1 className="text-[18px] font-bold tracking-tighter font-theme-mono uppercase">XML/JSON to OWL Converter</h1>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full flex flex-col">
        <div className="flex flex-col lg:flex-row h-full min-h-[500px] border-x border-theme-line bg-white">
          
          <div className="w-full lg:w-1/3 flex flex-col shrink-0 border-r-0 lg:border-r border-theme-line bg-white">
            <div className="flex border-b border-theme-line">
              <button
                className={`flex-1 py-3 text-[11px] font-theme-sans font-bold uppercase tracking-widest ${format === 'xml' ? 'bg-theme-bg text-theme-ink border-b-2 border-theme-ink' : 'bg-white text-theme-ink opacity-50 hover:bg-neutral-50 border-b-2 border-transparent'}`}
                onClick={() => setFormat('xml')}
              >
                VP XML
              </button>
              <button
                className={`flex-1 py-3 text-[11px] font-theme-sans font-bold uppercase tracking-widest border-l border-theme-line ${format === 'json' ? 'bg-theme-bg text-theme-ink border-b-2 border-theme-ink' : 'bg-white text-theme-ink opacity-50 hover:bg-neutral-50 border-b-2 border-transparent'}`}
                onClick={() => setFormat('json')}
              >
                OntoUML JSON
              </button>
            </div>
            
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="group border-b border-theme-line p-8 flex flex-col justify-center items-center text-center bg-theme-bg hover:bg-white transition-all cursor-pointer relative overflow-hidden flex-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept={format === 'xml' ? ".xml" : ".json"} 
                className="hidden" 
              />
              <div className="w-16 h-16 bg-theme-ink text-theme-bg flex items-center justify-center mb-6 group-hover:bg-theme-accent transition-colors">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="font-theme-sans font-semibold text-[13px] text-theme-ink uppercase tracking-widest mb-2">
                Upload {format === 'xml' ? 'Visual Paradigm XML' : 'OntoUML JSON'}
              </h3>
              <p className="text-[11px] font-theme-serif italic text-theme-ink opacity-70 max-w-[200px]">
                Drag and drop your {format.toUpperCase()} file here, or click to browse files
              </p>
            </div>

            {error && (
              <div className="bg-[#880000] text-white p-4 border-b border-theme-line text-[11px] font-theme-mono">
                <p className="font-bold">Error parsing file:</p>
                <p className="mt-1 opacity-90">{error}</p>
              </div>
            )}

            {fileName && !error && (
              <div className="bg-white border-b border-theme-line p-6 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-dotted border-theme-line">
                  <div className="p-2 bg-theme-bg text-theme-ink border border-theme-line shrink-0">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-theme-mono font-bold text-sm text-theme-ink truncate" title={fileName}>{fileName}</p>
                    <p className="text-[11px] font-theme-serif italic text-theme-ink opacity-70">Processed successfully</p>
                  </div>
                </div>

                <div className="space-y-4 mt-auto">
                  <h4 className="text-[11px] font-theme-serif italic uppercase tracking-wider text-theme-ink opacity-70 mb-4">Extracted OWL Entities</h4>
                  <div className="grid grid-cols-3 gap-3 text-center font-theme-mono">
                    <div className="bg-[#FAFAFA] py-3 px-2 border border-theme-line">
                      <span className="block text-lg font-bold text-theme-ink">{stats.classes}</span>
                      <span className="block text-[10px] text-theme-ink opacity-80 mt-1 uppercase">Classes</span>
                    </div>
                    <div className="bg-[#FAFAFA] py-3 px-2 border border-theme-line">
                      <span className="block text-lg font-bold text-theme-ink">{stats.props}</span>
                      <span className="block text-[10px] text-theme-ink opacity-80 mt-1 uppercase">Properties</span>
                    </div>
                    <div className="bg-[#FAFAFA] py-3 px-2 border border-theme-line">
                      <span className="block text-lg font-bold text-theme-ink">{stats.generalizations}</span>
                      <span className="block text-[10px] text-theme-ink opacity-80 mt-1 uppercase">Subclasses</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full lg:w-2/3 flex flex-col bg-[#FAFAFA] min-h-[500px]">
            <div className="px-4 py-3 border-b border-theme-line bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center text-[11px] font-theme-serif italic uppercase tracking-wider text-theme-ink opacity-70">
                <FileType className="w-4 h-4 mr-2" />
                RDF/XML Output (Protégé Compatible)
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={copyToClipboard}
                  disabled={!owlContent}
                  className="flex items-center justify-center p-2 text-theme-ink hover:text-theme-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle2 className="w-5 h-5 text-theme-accent" /> : <Copy className="w-5 h-5" />}
                </button>
                <button
                  onClick={downloadFile}
                  disabled={!owlContent}
                  className="flex items-center gap-2 px-4 py-2 font-theme-sans font-semibold text-[12px] uppercase tracking-widest bg-theme-ink text-theme-bg border-none hover:bg-theme-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Save .owl
                </button>
              </div>
            </div>
            
            <div className="flex-1 bg-[#FAFAFA] relative overflow-auto flex flex-col">
              {owlContent ? (
                <textarea
                  readOnly
                  value={owlContent}
                  className="w-full h-full min-h-[400px] p-6 text-[13px] leading-[1.6] font-theme-mono text-[#333] bg-transparent border-none outline-none resize-none focus:outline-none focus:ring-0"
                  style={{ tabSize: 4 }}
                />
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center p-8 bg-[#FAFAFA]">
                  <ArrowRight className="w-12 h-12 text-theme-line opacity-20 mb-4" />
                  <p className="font-theme-mono text-[13px] text-theme-ink opacity-60">Upload a project XML to view the RDF source</p>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}

