from pprint import pprint
import math

def main():
    for d in range(1, 208):
        
        pprint(1 + 0.001 * math.sqrt(d**3)    )

if __name__ == '__main__':
    main()
