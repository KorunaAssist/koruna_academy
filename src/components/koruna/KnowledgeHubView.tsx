import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Building2,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  CircleX,
  FileText,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon
} from 'lucide-react';
import { dbService, type KnowledgeHubResource } from '../../services/db';

type KnowledgeSection = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'company' | 'policies' | 'operations' | 'industry';
  resources: string[];
};

type KnowledgeResource = {
  title: string;
  section: string;
  description: string;
  content?: string;
  fileName?: string;
  fileUrl?: string;
};

const knowledgeSections: KnowledgeSection[] = [
  {
    title: 'Company',
    description: 'The essentials for understanding Koruna and how we work together.',
    icon: Building2,
    tone: 'company',
    resources: [
      'Employee Handbook',
      'Company Values',
      'Org Chart',
      'Benefits',
      'Code of Conduct',
      'FAQs'
    ]
  },
  {
    title: 'Policies',
    description: 'The policies that keep our workplace secure, consistent, and fair.',
    icon: ShieldCheck,
    tone: 'policies',
    resources: [
      'IT Policy',
      'Privacy & Security',
      'Leave Policy',
      'Attendance',
      'Performance',
      'Communication',
      'Work-from-home',
      'Social Media',
      'More policies'
    ]
  },
  {
    title: 'Operations',
    description: 'Practical resources to help VAs deliver excellent work every day.',
    icon: Workflow,
    tone: 'operations',
    resources: [
      'SOPs',
      'Process Guides',
      'Templates',
      'Checklists',
      'Client Communication Guides',
      'Systems / How-to Guides'
    ]
  },
  {
    title: 'Industry Knowledge',
    description: 'Build confidence in the industries, tools, and opportunities we support.',
    icon: Lightbulb,
    tone: 'industry',
    resources: [
      'Mortgage',
      'Financial Planning',
      'AI',
      'Future Verticals'
    ]
  }
];

export const KnowledgeHubView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeResource, setActiveResource] = useState<KnowledgeResource | null>(null);
  const [savedResources, setSavedResources] = useState<string[]>([]);
  const [customResources, setCustomResources] = useState<KnowledgeHubResource[]>([]);

  const totalResources = knowledgeSections.reduce((total, section) => total + section.resources.length, 0);

  const openResource = (title: string, section: KnowledgeSection) => {
    setActiveResource({
      title,
      section: section.title,
      description: `${title} is part of the ${section.title} collection. Open this resource to find practical guidance, reference material, and the next steps for your work.`
    });
  };

  useEffect(() => {
    const loadResources = () => { void dbService.getKnowledgeHubResources().then(setCustomResources); };
    loadResources();
    window.addEventListener('koruna-knowledge-hub-updated', loadResources);
    return () => window.removeEventListener('koruna-knowledge-hub-updated', loadResources);
  }, []);

  const toggleSaved = (title: string) => {
    setSavedResources((current) => current.includes(title)
      ? current.filter((resource) => resource !== title)
      : [...current, title]);
  };

  const visibleSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return knowledgeSections;

    return knowledgeSections
      .map((section) => {
        const matchesSection = `${section.title} ${section.description}`.toLowerCase().includes(normalizedQuery);
        return {
          ...section,
          resources: matchesSection
            ? section.resources
            : section.resources.filter((resource) => resource.toLowerCase().includes(normalizedQuery))
        };
      })
      .filter((section) => section.resources.length > 0);
  }, [query]);

  return (
    <main className="knowledge-hub-page">
      <section className="knowledge-hub-hero" aria-labelledby="knowledge-hub-title">
        <div className="knowledge-hub-hero-copy">
          <div className="knowledge-hub-hero-title-row">
            <span className="knowledge-hub-hero-icon" aria-hidden="true">
              <BookOpen size={26} strokeWidth={2.25} />
            </span>
            <p className="knowledge-hub-eyebrow">KORUNA RESOURCE LIBRARY</p>
          </div>
          <h2 id="knowledge-hub-title">Knowledge Hub</h2>
          <p>This is where you put everything VAs need to do their job and understand Koruna.</p>
          <div className="knowledge-hub-hero-meta" aria-label="Knowledge Hub summary">
            <span><strong>4</strong> knowledge collections</span>
            <span><strong>{totalResources}</strong> resource areas</span>
          </div>
        </div>
        <div className="knowledge-hub-hero-visual">
          <img
            src="/images/knowledge-hub/knowledge-hub-hero.png"
            alt="Virtual assistant organizing knowledge resources at a desk"
          />
          <span className="knowledge-hub-hero-badge"><Sparkles size={14} /> Built for VA success</span>
        </div>
      </section>

      <label className="knowledge-hub-search" htmlFor="knowledge-hub-search">
        <Search size={19} aria-hidden="true" />
        <input
          id="knowledge-hub-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the Knowledge Hub..."
        />
      </label>

      <div className="knowledge-hub-summary">
        <div>
          <h3>Explore Koruna resources</h3>
          <p>Find the information you need, organized by the way you work.</p>
        </div>
        <span>{savedResources.length ? `${savedResources.length} saved` : `${totalResources} resource areas`}</span>
      </div>

      {visibleSections.length > 0 ? (
        <>
          <div className="knowledge-hub-grid">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              return (
                <section className={`knowledge-hub-card knowledge-hub-card-${section.tone}`} key={section.title}>
                  <div className="knowledge-hub-card-heading">
                    <span className="knowledge-hub-card-icon" aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.description}</p>
                    </div>
                  </div>
                  <ul>
                    {section.resources.map((resource) => (
                      <li key={resource}>
                        <FileText size={16} aria-hidden="true" />
                        <button type="button" className="knowledge-hub-resource-link" onClick={() => openResource(resource, section)}>
                          {resource}<ChevronRight size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="knowledge-hub-save-button"
                          onClick={() => toggleSaved(resource)}
                          aria-label={`${savedResources.includes(resource) ? 'Remove' : 'Save'} ${resource}`}
                          aria-pressed={savedResources.includes(resource)}
                        >
                          {savedResources.includes(resource) ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {customResources.filter((resource) => !query.trim() || `${resource.title} ${resource.section} ${resource.description}`.toLowerCase().includes(query.trim().toLowerCase())).length > 0 && (
            <section className="knowledge-hub-custom" aria-labelledby="knowledge-hub-custom-title">
              <div className="knowledge-hub-featured-heading">
                <div><p>LATEST FROM KORUNA</p><h3 id="knowledge-hub-custom-title">Recently added resources</h3></div>
                <span>{customResources.length} custom resource{customResources.length === 1 ? '' : 's'}</span>
              </div>
              <div className="knowledge-hub-custom-grid">
                {customResources.filter((resource) => !query.trim() || `${resource.title} ${resource.section} ${resource.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((resource) => (
                  <button key={resource.id} type="button" className="knowledge-hub-custom-card" onClick={() => setActiveResource(resource)}>
                    <FileText size={19} aria-hidden="true" /><span>{resource.section}</span><strong>{resource.title}</strong><p>{resource.description || (resource.fileName ? `Download ${resource.fileName}` : 'Open this resource.')}</p><em>{resource.fileName ? 'Open file' : 'Read resource'} <ChevronRight size={15} /></em>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!query.trim() && (
            <section className="knowledge-hub-featured" aria-labelledby="knowledge-hub-featured-title">
              <div className="knowledge-hub-featured-heading">
                <div>
                  <p>WORK SMARTER</p>
                  <h3 id="knowledge-hub-featured-title">Your go-to guides for the workday</h3>
                </div>
                <span>Designed for easy reference</span>
              </div>
              <div className="knowledge-hub-featured-grid">
                <article className="knowledge-hub-feature-card">
                  <img
                    src="/images/knowledge-hub/knowledge-hub-operations.png"
                    alt="Laptop, checklist, calendar, and workflow materials"
                    loading="lazy"
                  />
                  <div>
                    <p>OPERATIONS</p>
                    <h3>Stay clear, consistent, and on track.</h3>
                    <span>SOPs, templates, checklists, and practical how-to guides.</span>
                    <button type="button" onClick={() => setQuery('operations')}>Explore operations <ChevronRight size={15} /></button>
                  </div>
                </article>
                <article className="knowledge-hub-feature-card">
                  <img
                    src="/images/knowledge-hub/knowledge-hub-industry.png"
                    alt="Home, financial planning materials, and AI learning symbols"
                    loading="lazy"
                  />
                  <div>
                    <p>INDUSTRY KNOWLEDGE</p>
                    <h3>Build confidence in every conversation.</h3>
                    <span>Mortgage, financial planning, AI, and future verticals.</span>
                    <button type="button" onClick={() => setQuery('industry')}>Explore industry knowledge <ChevronRight size={15} /></button>
                  </div>
                </article>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="knowledge-hub-empty">
          <BookOpen size={24} aria-hidden="true" />
          <h3>No resources found</h3>
          <p>Try a different search term.</p>
        </div>
      )}

      {activeResource && (
        <div className="knowledge-hub-modal-backdrop" role="presentation" onMouseDown={() => setActiveResource(null)}>
          <section className="knowledge-hub-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-resource-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="knowledge-hub-modal-close" onClick={() => setActiveResource(null)} aria-label="Close resource details"><CircleX size={20} /></button>
            <span className="knowledge-hub-modal-eyebrow">{activeResource.section}</span>
            <FileText size={26} aria-hidden="true" />
            <h3 id="knowledge-resource-title">{activeResource.title}</h3>
            <p>{activeResource.description}</p>
            {activeResource.content && <div className="knowledge-hub-modal-content">{activeResource.content}</div>}
            {activeResource.fileUrl && <a className="knowledge-hub-file-link" href={activeResource.fileUrl} target="_blank" rel="noreferrer">Open {activeResource.fileName || 'attached file'} <ChevronRight size={16} /></a>}
            <div className="knowledge-hub-modal-actions">
              <button type="button" className="knowledge-hub-primary-action" onClick={() => toggleSaved(activeResource.title)}>
                {savedResources.includes(activeResource.title) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                {savedResources.includes(activeResource.title) ? 'Saved to my resources' : 'Save for later'}
              </button>
              <button type="button" className="knowledge-hub-secondary-action" onClick={() => setActiveResource(null)}>Done</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
