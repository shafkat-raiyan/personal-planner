from flask import Flask, render_template

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.route('/')
def home():
    return render_template('index.html')

# Optional: health check route for uptime monitors
@app.route('/health')
def health():
    return 'ok', 200

if __name__ == '__main__':
    app.run(debug=True)
