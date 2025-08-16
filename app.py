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
    # Bind to all interfaces so phones on the same Wi-Fi can reach it
    app.run(host='0.0.0.0', port=5000, debug=False)
