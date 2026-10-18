
import sys
from pathlib import Path
from rembg import remove, new_session

def main():
    if len(sys.argv) != 3:
        print("Usage: remove_bg.py input output", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()

    if not input_path.is_file():
        print("Input image not found", file=sys.stderr)
        return 1

    # Use the standard U2Net model.
    session = new_session("u2net")

    with input_path.open("rb") as source:
        result = remove(source.read(), session=session)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(result)

    print("Background removed successfully")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Processing failed: {exc}", file=sys.stderr)
        sys.exit(1)
