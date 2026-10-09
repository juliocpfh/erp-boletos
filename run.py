"""Inicia o sistema e abre o navegador.

    python run.py            -> só neste computador (http://127.0.0.1:8080)
    python run.py --rede     -> também para outros computadores da rede
    python run.py --porta 9000 --dados D:\\Imoveis\\dados
"""
import argparse
import socket
import threading
import webbrowser

from app import create_app


def ip_local() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser(description="Administração de Imóveis")
    parser.add_argument("--rede", action="store_true", help="permitir acesso de outros computadores da rede")
    parser.add_argument("--porta", type=int, default=8080)
    parser.add_argument("--dados", help="pasta onde ficam o banco e os arquivos (padrão: ./dados)")
    parser.add_argument("--sem-navegador", action="store_true")
    args = parser.parse_args()

    app = create_app(args.dados)
    host = "0.0.0.0" if args.rede else "127.0.0.1"
    endereco = f"http://127.0.0.1:{args.porta}"
    print("=" * 60)
    print(" Administração de Imóveis")
    print(f" Abra no navegador: {endereco}")
    if args.rede:
        print(f" Outros computadores da rede: http://{ip_local()}:{args.porta}")
    print(f" Pasta dos dados: {app.config['PASTA_DADOS']}")
    print(" Para encerrar, feche esta janela.")
    print("=" * 60)
    if not args.sem_navegador:
        threading.Timer(1.5, lambda: webbrowser.open(endereco)).start()
    try:
        from waitress import serve
        serve(app, host=host, port=args.porta, threads=8)
    except ImportError:
        app.run(host=host, port=args.porta, threaded=True)


if __name__ == "__main__":
    main()
