# Technical Skills and Requirements

## Project Structure

- **Package Manager**: Use Bun as the TypeScript runtime and package manager
- **Monorepo Structure**: Organize as a monorepo with individual `package.json` files in each subdirectory
- **Starting Structure**: Begin with a `poc/` subdirectory for the Fireblocks signature caching proof of concept

## TypeScript Configuration

- Maintain proper `tsconfig.json` files at both root and package levels
- Use strict TypeScript configuration with proper type safety
- Configure path mapping for clean imports across packages
- Enable ES modules and modern JavaScript features

## Dependencies

- **Seismic Integration**: Use `seismic-viem` version `1.1.0`
- **Fireblocks SDK**: Use the latest version of `fireblocks-sdk`
- **Additional Dependencies**: Include necessary crypto, testing, and utility libraries

## Code Quality Standards

- **Clean Code Principles**: Follow Robert C. Martin's Clean Code principles
  - Meaningful names for variables, functions, and classes
  - Small, focused functions that do one thing well
  - Clear separation of concerns
  - Minimal comments (self-documenting code)
- **SICP Principles**: Apply Structure and Interpretation of Computer Programs concepts
  - Functional programming patterns where appropriate
  - Data abstraction and procedural abstraction
  - Higher-order functions for code reuse
  - Immutable data structures when possible
- **Code Organization**:
  - Single Responsibility Principle
  - Open/Closed Principle
  - Dependency Inversion
  - Clear module boundaries
  - Consistent error handling patterns

## Development Practices

- Use TypeScript strict mode
- Implement proper error handling with typed errors
- Write self-documenting code with clear interfaces
- Follow consistent naming conventions
- Maintain clean git history with meaningful commits
- Use environment variables for configuration
- Implement proper logging for debugging and monitoring

## SRC20 Token Deployment

- Follow Seismic's SRC20 standard (confidential ERC20 with `suint256` types)
- Use Foundry for smart contract compilation and deployment
- Implement proper deployment scripts following the existing pattern in `contracts/script/`
- Support both testnet and mainnet deployments via environment configuration
- Include proper minting functionality for testing purposes
