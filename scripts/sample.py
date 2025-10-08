#!/usr/bin/env python3
"""
Sample Python program for testing PyStacker extension.
This program runs multiple threads doing recursive computations and
continues until the user presses a key (Enter). Small sleeps and
variable recursion depths make stack dumps vary between captures.
"""

import time
import threading
import sys
import random
from datetime import datetime


def fibonacci(n):
    """Calculate fibonacci number recursively (inefficient on purpose)."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)


def deep_recursive(n, depth):
    """A small recursive helper that adds stack depth and sleeps briefly."""
    if depth <= 0:
        # Base case: do a small fibonacci to burn some CPU
        return fibonacci(n % 20)
    # small sleep to increase likelihood of differing stacks between captures
    time.sleep(random.uniform(0.01, 0.06))
    return deep_recursive(n, depth - 1)


stop_event = threading.Event()


def worker_thread(thread_id):
    """Worker thread that does varied recursive work until stopped."""
    print(f"[Thread {thread_id}] Started at {datetime.now().strftime('%H:%M:%S')}")

    iterations = 0
    while not stop_event.is_set():
        # Vary work: sometimes deep recursion, sometimes fibonacci alone
        depth = random.randint(1, 5)
        n = random.randint(18, 24)  # slightly vary fibonacci size

        # Mix two recursive workloads to change call stacks
        _ = deep_recursive(n, depth)
        _ = fibonacci(n // 2)

        if iterations % 5 == 0:
            print(f"[Thread {thread_id}] Iteration {iterations}, depth={depth}, n={n}")

        # Small random sleep so threads fall into different states on refresh
        time.sleep(random.uniform(0.05, 0.3))
        iterations += 1

    print(f"[Thread {thread_id}] Stopping at {datetime.now().strftime('%H:%M:%S')}")


def wait_for_keypress(prompt="Press Enter to stop... "):
    """Wait for a single keypress (Enter) in a cross-platform way.

    Falls back to input() if platform-specific single-key handlers aren't
    available. This keeps the script simple and cross-platform.
    """
    try:
        # Windows: msvcrt.getch reads a single key
        import msvcrt

        print(prompt, end='', flush=True)
        msvcrt.getch()
        print('')
    except Exception:
        # Fallback: require Enter (portable)
        try:
            input(prompt)
        except EOFError:
            # When stdin is not interactive (e.g. run in some automated environment)
            # just wait until stop_event is set elsewhere or sleep briefly
            time.sleep(0.1)


def main():
    """Main function that spawns worker threads and waits for user to stop."""
    print("=" * 60)
    print("PyStacker Sample Program")
    print("=" * 60)
    print(f"PID: {threading.get_native_id() if hasattr(threading, 'get_native_id') else 'N/A'}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\nThis program will run until you press Enter.")
    print("Use PyStacker to capture stack traces while it's running!")
    print("\nPress Enter to stop the program.\n")
    print("=" * 60)

    # Create multiple worker threads
    num_threads = 3
    threads = []

    for i in range(num_threads):
        thread = threading.Thread(target=worker_thread, args=(i + 1,), daemon=True)
        threads.append(thread)
        thread.start()
        time.sleep(0.05)  # Stagger thread starts slightly

    try:
        # Wait for user to press a key (Enter)
        wait_for_keypress()
        # Signal threads to stop
        stop_event.set()

        # Give threads a moment to exit gracefully, then join
        for thread in threads:
            thread.join(timeout=2)

        print("\n" + "=" * 60)
        print("All threads stopped. Exiting...")
        print("=" * 60)
    except KeyboardInterrupt:
        stop_event.set()
        print("\n\nInterrupted by user. Exiting...")
        sys.exit(0)


if __name__ == "__main__":
    main()