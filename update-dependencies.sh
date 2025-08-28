#!/bin/bash

echo "🔍 Checking for outdated dependencies..."

# Frontend dependencies
echo "📦 Frontend Dependencies:"
cd frontend
echo "Current versions:"
npm list --depth=0
echo ""
echo "Outdated packages:"
npm outdated || echo "All packages are up to date!"
echo ""

# Backend dependencies
echo "🐍 Backend Dependencies:"
cd ../backend
echo "Current versions:"
pip list
echo ""
echo "Checking for outdated packages..."
pip list --outdated || echo "All packages are up to date!"
echo ""

# Docker images
echo "🐳 Docker Images:"
echo "Current images:"
docker images | grep -E "(node|python|postgres)"
echo ""

echo "✅ Dependency check complete!"
echo ""
echo "To update frontend packages:"
echo "  cd frontend && npm update"
echo ""
echo "To update backend packages:"
echo "  cd backend && pip install --upgrade -r requirements.txt"
echo ""
echo "To rebuild Docker containers:"
echo "  docker-compose down && docker-compose up --build -d"
