#include <iostream>
int main() {
  int p, d; std::cin >> p >> d;
  std::cout << (p + d) << std::endl; // BUG: should be p - d
  return 0;
}