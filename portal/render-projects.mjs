const categoryLabels = { tool: '实用工具', game: '互动游戏' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function renderProjects(projects) {
  return projects.map((project) => {
    const title = escapeHtml(project.title);
    const search = escapeHtml(`${project.title} ${project.description} ${categoryLabels[project.category]}`);
    return `<article class="project-card" data-project-id="${escapeHtml(project.id)}" data-category="${escapeHtml(project.category)}" data-search="${search}">
        <a class="project-link" href="${escapeHtml(project.path)}" aria-label="${title}，${escapeHtml(project.action)}">
          <div class="project-cover">
            <img src="${escapeHtml(project.image)}" alt="" width="1440" height="960" fetchpriority="${project.id === 'rehearsal' ? 'high' : 'auto'}" decoding="async">
            <span class="category-label">${categoryLabels[project.category]}</span>
            <span class="cover-open" aria-hidden="true">↗</span>
          </div>
          <div class="project-info">
            <h2>${title}</h2>
            <p>${escapeHtml(project.description)}</p>
            <span class="project-action">${escapeHtml(project.action)} <span aria-hidden="true">↗</span></span>
          </div>
        </a>
      </article>`;
  }).join('\n');
}
