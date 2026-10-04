const grid = document.querySelector('#module-grid');
const status = document.querySelector('#status');
const moduleCount = document.querySelector('#module-count');

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createModuleCard(module) {
  const card = createElement('a', 'module-card');
  card.href = module.path;
  card.setAttribute('aria-label', `Open ${module.name}`);

  const cardTop = createElement('div', 'card-top');
  if (module.category) {
    cardTop.append(createElement('span', 'category', module.category));
  }

  cardTop.append(
    createElement('h3', 'module-name', module.name),
    createElement('p', 'module-description', module.description || module.id)
  );

  const footer = createElement('div', 'card-footer');
  footer.append(
    createElement('span', '', 'Open module'),
    createElement('span', 'open-arrow', '→')
  );

  card.append(cardTop, footer);
  return card;
}

async function loadModules() {
  try {
    const response = await fetch('/api/modules', {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const modules = await response.json();
    status.hidden = true;
    moduleCount.textContent = `${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`;

    if (modules.length === 0) {
      status.className = 'status';
      status.textContent = 'No modules found. Add a folder with index.html to modules/.';
      status.hidden = false;
      return;
    }

    const fragment = document.createDocumentFragment();
    modules.forEach((module) => fragment.append(createModuleCard(module)));
    grid.replaceChildren(fragment);
  } catch (error) {
    console.error(error);
    status.className = 'status error';
    status.textContent = 'Could not load modules. Check that the server is running and try again.';
    moduleCount.textContent = '';
  }
}

loadModules();
