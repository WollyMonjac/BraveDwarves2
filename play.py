# Starts a small local web server for Vaprad Päkapikud and opens it in the browser.
# Käivita:  python play.py   (vajab Python 3)
import http.server, socketserver, threading, webbrowser, os, functools
os.chdir(os.path.dirname(os.path.abspath(__file__)))
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
for port in range(8000, 8100):
    try:
        httpd = socketserver.TCPServer(('127.0.0.1', port), Handler)
        break
    except OSError:
        continue
url = f'http://127.0.0.1:{port}/index.html'
print('Vaprad Päkapikud:', url, '(sulgemiseks Ctrl+C)')
threading.Timer(0.8, lambda: webbrowser.open(url)).start()
httpd.serve_forever()
