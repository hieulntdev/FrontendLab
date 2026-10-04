# FrontendLab

A lightweight dashboard for independent HTML, CSS, and JavaScript modules. The launcher uses only Node.js built-in APIs and discovers modules automatically.

## Run

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Set `PORT` or `HOST` if you need a different local address.

## Add a new module

Copy a folder into `modules/`:

```text
modules/
└── my-animation/
    ├── index.html
    ├── style.css
    └── script.js
```

Only `index.html` is required. Reload the dashboard (or restart the server) and the module appears automatically—no central registration or dashboard changes are needed.

You can optionally add `module.json`:

```json
{
  "name": "My Animation",
  "description": "A short description of the experiment",
  "category": "Animation"
}
```

Invalid or missing metadata falls back to a readable version of the folder name.

## Structure

```text
FrontendLab/
├── dashboard/       # Dashboard UI
├── modules/         # Independent frontend modules
├── server.js        # Static server and module discovery API
└── package.json
```

Each module remains self-contained. Relative CSS, JavaScript, image, and font paths continue to resolve from that module's own directory.

## Credits

The original frontend experiments and demo code collected in `modules/` are sourced from and credited to [Code Wars Official on Instagram](https://www.instagram.com/code_wars_official/reels/).

All rights to the original examples and creative work belong to their respective creator.
