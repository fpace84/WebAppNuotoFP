function Unauthorized() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <h2 className="text-center text-2xl font-bold text-red-600 mb-4">
            Accesso non autorizzato
          </h2>
          <p className="text-center text-gray-600 mb-4">
            Non hai i permessi necessari per accedere a questa pagina.
          </p>
          <div className="text-center">
            <Link
              to="/dashboard"
              className="text-indigo-600 hover:text-indigo-500"
            >
              Torna alla Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
