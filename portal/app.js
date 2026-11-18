const search = document.getElementById('project-search');
const clearSearch = document.getElementById('clear-search');
const filters = [...document.querySelectorAll('[data-filter]')];
const projects = [...document.querySelectorAll('[data-project-id]')];
let selectedCategory = 'all';

function showProjects() {
  const query = search.value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
  let visibleCount = 0;
  for (const project of projects) {
    const categoryMatches = selectedCategory === 'all' || project.dataset.category === selectedCategory;
    const textMatches = project.dataset.search.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(query);
    project.hidden = !(categoryMatches && textMatches);
    if (!project.hidden) visibleCount += 1;
  }
  for (const filter of filters) {
    const active = filter.dataset.filter === selectedCategory;
    filter.classList.toggle('active', active);
    filter.setAttribute('aria-pressed', String(active));
  }
  clearSearch.hidden = !search.value;
  document.getElementById('empty-state').hidden = visibleCount > 0;
  document.getElementById('search-status').textContent = visibleCount ? `显示 ${visibleCount} 个项目` : '';
}

for (const filter of filters) {
  filter.addEventListener('click', () => {
    selectedCategory = filter.dataset.filter;
    showProjects();
  });
}

search.addEventListener('input', showProjects);
search.closest('form').addEventListener('submit', (event) => {
  event.preventDefault();
  showProjects();
});
clearSearch.addEventListener('click', () => {
  search.value = '';
  showProjects();
  search.focus();
});
document.getElementById('reset-filters').addEventListener('click', () => {
  search.value = '';
  selectedCategory = 'all';
  showProjects();
  search.focus();
});

function preserveOrganizerLink() {
  if (location.hash === '#organizer') location.replace('/rehearsal/#organizer');
}

window.addEventListener('hashchange', preserveOrganizerLink);
preserveOrganizerLink();
showProjects();
