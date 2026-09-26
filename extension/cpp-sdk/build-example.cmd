@echo off
setlocal
cd /d "%~dp0"
set OUT=example-unity.wasm
set SRC=example-unity.cpp

where clang++ >nul 2>nul
if %ERRORLEVEL%==0 goto clang
where em++ >nul 2>nul
if %ERRORLEVEL%==0 goto emscripten

echo [YURIKA C++ SDK] clang++ or em++ was not found.
echo Install LLVM with WebAssembly target support, or Emscripten SDK, then run this file again.
pause
exit /b 1

:clang
echo [YURIKA C++ SDK] Building with clang++...
clang++ --target=wasm32 -O3 -nostdlib -fno-exceptions -fno-rtti ^
  -Wl,--no-entry -Wl,--export-memory ^
  -Wl,--export=yurika_cpp_abi_version ^
  -Wl,--export=yurika_cpp_buffer ^
  -Wl,--export=yurika_cpp_reset ^
  -Wl,--export=yurika_cpp_set_param ^
  -Wl,--export=yurika_cpp_process ^
  -Wl,--initial-memory=131072 ^
  -o "%OUT%" "%SRC%"
if errorlevel 1 goto fail
goto done

:emscripten
echo [YURIKA C++ SDK] Building with em++...
em++ -O3 -fno-exceptions -fno-rtti -s STANDALONE_WASM=1 -s ERROR_ON_UNDEFINED_SYMBOLS=1 ^
  -Wl,--no-entry ^
  -Wl,--export=yurika_cpp_abi_version ^
  -Wl,--export=yurika_cpp_buffer ^
  -Wl,--export=yurika_cpp_reset ^
  -Wl,--export=yurika_cpp_set_param ^
  -Wl,--export=yurika_cpp_process ^
  -o "%OUT%" "%SRC%"
if errorlevel 1 goto fail
goto done

:done
echo [YURIKA C++ SDK] OK: %OUT%
pause
exit /b 0

:fail
echo [YURIKA C++ SDK] BUILD FAILED
pause
exit /b 1
